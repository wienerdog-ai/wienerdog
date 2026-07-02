---
type: research
date: 2026-07-03
topic: codex-cli-config-surface
---

# Question

For the Wienerdog "Codex CLI adapter" spec, what is the current (mid-2026) OpenAI Codex CLI
(`openai/codex`, `@openai/codex` npm, `codex` binary) configuration surface for: `$CODEX_HOME`,
skill registration, global `AGENTS.md`, lifecycle hooks, `codex exec` headless sandbox/approval
flags, and session rollout file paths?

Method: fetched `developers.openai.com/codex/*` pages directly (raw HTML, hand-parsed — not via
the summarizing WebFetch tool, after a first pass with WebFetch produced thin/unreliable
summaries), cross-checked against the `openai/codex` GitHub repo's `docs/*.md` stub files (which
now just point at the hosted docs site) and, for the two flag-behavior questions, against live
GitHub issues and the Rust source itself. All fetches performed 2026-07-03.

# Findings

### 1. `$CODEX_HOME`

- **VERIFIED-CURRENT.** Env var name is exactly `CODEX_HOME`. Default: `~/.codex`. Setting it
  redirects config, auth, logs, sessions, skills, and standalone package metadata; "If you set it,
  the directory must already exist" (i.e. Codex will not create a custom `CODEX_HOME` root for
  you — unlike the default `~/.codex`, which it does create).
  Source: https://developers.openai.com/codex/environment-variables (fetched 2026-07-03).
- Related var: `CODEX_SQLITE_HOME` (defaults to `CODEX_HOME`; `sqlite_home` config key takes
  precedence over it).
- Confirmed again independently in the AGENTS.md guide: "Set the `CODEX_HOME` environment
  variable when you want a different profile... `CODEX_HOME=$(pwd)/.codex codex exec ...`".
  Source: https://developers.openai.com/codex/guides/agents-md (fetched 2026-07-03).

### 2. Skills — NOT registered via a `[skills]`/`[[skills]]` table. Auto-discovered from directories.

- **VERIFIED-CURRENT.** There is no TOML mechanism to *register* a skill by path+name. Skills are
  a directory format (`SKILL.md` + optional `scripts/`, `references/`, `assets/`,
  `agents/openai.yaml`), auto-discovered by scanning fixed filesystem locations, in this
  precedence order:

  | Scope | Path |
  |---|---|
  | REPO | `$CWD/.agents/skills` |
  | REPO | `$CWD/../.agents/skills` (a folder above CWD, if inside a git repo) |
  | REPO | `$REPO_ROOT/.agents/skills` |
  | USER | `$HOME/.agents/skills` |
  | ADMIN | `/etc/codex/skills` |
  | SYSTEM | bundled with Codex |

  Note: this is `$HOME/.agents/skills`, **not** `$CODEX_HOME/.agents/skills` or
  `~/.codex/skills` — a user-scope skill directory is independent of `CODEX_HOME`. Symlinked
  skill folders are followed.

  The **only** TOML surface for skills in `config.toml` is a disable/enable override for an
  *already-discovered* skill, via an array of tables:
  ```toml
  [[skills.config]]
  path = "/path/to/skill/SKILL.md"
  enabled = false
  ```
  This does not add a new skill location; it toggles one already found via the discovery scan.
  Confirmed identically in two independent places: the rendered `skills` doc page and the raw
  JSON-embedded config schema on the config-reference page (`skills.config`, type
  `array<object>`, description "Per-skill enablement overrides stored in config.toml").

  Sources: https://developers.openai.com/codex/skills (fetched 2026-07-03),
  https://developers.openai.com/codex/config-reference (fetched 2026-07-03, extracted from the
  page's embedded JSON schema blob, not model-summarized).

- **Wienerdog implication**: to "install" a Wienerdog skill for Codex, the installer must write
  (or symlink) a `SKILL.md`-shaped directory into `$HOME/.agents/skills/<skill-name>/` (user
  scope) — there is no config.toml edit required or possible for registration. This is a
  materially different mechanism than Claude Code's plugin/skill install path; the adapter must
  target the `.agents/skills` directory layout, not a config key.

### 3. `AGENTS.md` — global path and precedence

- **VERIFIED-CURRENT.** Global (user) file: `~/.codex/AGENTS.md` (i.e. `$CODEX_HOME/AGENTS.md`).
  There is also `~/.codex/AGENTS.override.md` — if present, it is used *instead of* `AGENTS.md` at
  the global level (first non-empty file wins, override checked first).
- Precedence / merge order, verified verbatim:
  1. **Global scope**: in `CODEX_HOME` (default `~/.codex`), read `AGENTS.override.md` if it
     exists, else `AGENTS.md`. Only the first non-empty file at this level is used.
  2. **Project scope**: starting at the project root (typically git root) and walking down to
     cwd, each directory is checked for `AGENTS.override.md`, then `AGENTS.md`, then any
     configured `project_doc_fallback_filenames`. At most one file per directory.
  3. **Merge**: concatenated root-to-current, joined with blank lines; files closer to cwd appear
     later in the combined prompt and so override earlier guidance.
  - Truncation: total combined size stops growing once it hits `project_doc_max_bytes` (config
    key; **32 KiB default**). Empty files are skipped.
  - This instruction chain is rebuilt every run/session — no persistent cache.

  Source: https://developers.openai.com/codex/guides/agents-md (fetched 2026-07-03).

- **Wienerdog implication**: Wienerdog's "managed block" convention for `~/.codex/AGENTS.md` is
  directly analogous to what it already does for Claude Code's `~/.claude/CLAUDE.md` — same
  target file name pattern, same directory. Good news: no adapter-specific override mechanism
  needed beyond writing `~/.codex/AGENTS.md`. Caveat: if the user already has an
  `~/.codex/AGENTS.override.md`, Wienerdog's global `AGENTS.md` content is **silently ignored** —
  worth a preflight check/warning in the installer.

### 4. `hooks.json` / lifecycle hooks — supported, stable, and (this is the big finding) schema-compatible with Claude Code's hook events

- **VERIFIED-CURRENT.** Hooks are enabled by default (`[features] hooks = false` to disable;
  `features.codex_hooks` is a deprecated alias for the same feature key). This is a maturing but
  documented, non-experimental feature as of the current docs (no "experimental" labeling on the
  hooks page itself, unlike some other `features.*` flags such as `code_mode` which are
  explicitly marked "under development and off by default").

- **File locations** (four canonical spots, first two are what Wienerdog needs):
  - `~/.codex/hooks.json` (i.e. `$CODEX_HOME/hooks.json`)
  - `~/.codex/config.toml` (inline `[hooks]` table)
  - `<repo>/.codex/hooks.json`
  - `<repo>/.codex/config.toml`
  If both `hooks.json` and inline `[hooks]` exist in the same layer, Codex merges them and warns
  at startup — prefer one representation per layer. All matching hook sources across layers are
  loaded (higher-precedence layers don't replace lower ones).

- **Event names — VERIFIED, and they are (not coincidentally) the same event set/names as
  Claude Code's hooks**: `SessionStart`, `SubagentStart`, `PreToolUse`, `PermissionRequest`,
  `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`.
  Codex even sets `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` env vars for plugin hook commands "for
  compatibility with existing plugin hooks," alongside its own `PLUGIN_ROOT`/`PLUGIN_DATA`. This
  is an explicit, acknowledged compatibility design on OpenAI's part, not a coincidence.

- **Exact JSON shape** (hooks.json, verified verbatim from docs):
  ```json
  {
    "hooks": {
      "SessionStart": [
        {
          "matcher": "startup|resume",
          "hooks": [
            {
              "type": "command",
              "command": "python3 ~/.codex/hooks/session_start.py",
              "statusMessage": "Loading session notes"
            }
          ]
        }
      ],
      "Stop": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/stop_continue.py\"",
              "timeout": 30
            }
          ]
        }
      ]
    }
  }
  ```
  Equivalent inline TOML (also verbatim from docs):
  ```toml
  [[hooks.PreToolUse]]
  matcher = "^Bash$"
  [[hooks.PreToolUse.hooks]]
  type = "command"
  command = '/usr/bin/python3 "$(git rev-parse --show-toplevel)/.codex/hooks/pre_tool_use_policy.py"'
  timeout = 30
  statusMessage = "Checking Bash command"
  ```
  - Only handler `type: "command"` runs today; `prompt` and `agent` handler types are parsed but
    skipped. `async: true` handlers are parsed but skipped (not yet supported).
  - `timeout` in seconds, default 600 if omitted. `statusMessage` optional.
  - `commandWindows` (JSON) / `command_windows` or `commandWindows` (TOML) is an optional
    Windows-only command override.
  - `matcher` is a regex string; omit, `""`, or `"*"` matches everything. Not all events honor
    `matcher` (`UserPromptSubmit` and `Stop` ignore it; `SessionStart` matches against `source`
    ∈ {startup, resume, clear, compact}; `PreToolUse`/`PostToolUse`/`PermissionRequest` match
    against `tool_name`).
  - Commands run with the **session cwd** as their working directory. Docs explicitly recommend
    resolving repo-local hook script paths from git root rather than a relative path, since Codex
    may start from a subdirectory.

- **stdin/stdout contract** (verified): every command hook gets one JSON object on stdin with
  common fields `session_id`, `transcript_path` (nullable — "not a stable interface... may change
  over time"), `cwd`, `hook_event_name`, `model`, and (for most events) `permission_mode` ∈
  {`default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`}. Turn-scoped hooks also carry
  `turn_id`. Output conventions per event (all verified verbatim against the docs page):
  - `SessionStart`/`UserPromptSubmit`: plain stdout text is added as extra developer/model
    context; JSON stdout supports `{"hookSpecificOutput": {"hookEventName": "...",
    "additionalContext": "..."}}` plus common output fields (`continue`, `stopReason`,
    `systemMessage`, `suppressOutput`).
  - `PreToolUse`: can deny with
    `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
    "permissionDecisionReason": "..."}}`, or the older `{"decision": "block", "reason": "..."}`
    shape, or exit code 2 + stderr text. Can rewrite tool input via
    `permissionDecision: "allow"` + `updatedInput`.
  - `PermissionRequest`: approve/deny via
    `{"hookSpecificOutput": {"hookEventName": "PermissionRequest",
    "decision": {"behavior": "allow"|"deny", "message": "..."}}}`. Any denying hook wins.
  - `Stop`/`SubagentStop`: **must** emit JSON on exit 0 (plain text is invalid for these two
    events); `{"decision": "block", "reason": "..."}` or exit 2 + stderr tells Codex to continue
    the turn/subagent with that reason as a new prompt.
  - Exit 0 with no output = success, Codex continues normally.

- **Trust model** (verified, relevant to Wienerdog's installer since it will write hook
  commands): non-managed hooks (anything not delivered via `requirements.toml`/MDM/managed
  config layers) must be reviewed and trusted by the user via `/hooks` in the CLI before they
  run — Codex hashes the hook definition and re-prompts trust on any change. There's a
  `--dangerously-bypass-hook-trust` flag for `codex exec`/global use in already-vetted automation
  contexts. **This means a Wienerdog-installed hooks.json will not silently start running** —
  first use requires an interactive trust step, unless the user runs with the bypass flag.

  Source: https://developers.openai.com/codex/hooks (fetched 2026-07-03, full page text
  extracted).

- **Wienerdog implication (big one)**: because Codex's hook event names, JSON shapes, and
  stdin/stdout contract are deliberately near-identical to Claude Code's (down to setting
  `CLAUDE_PLUGIN_ROOT` for compat), Wienerdog likely does **not** need a fallback-to-AGENTS.md-
  digest design for Codex the way the question worried about. A single hooks.json template with
  minor per-CLI differences (Codex needs `"hooks"` top-level wrapper key in the JSON file; Claude
  Code's hooks.json format should be diffed explicitly — flagging this as a spec question, not
  assuming). The one hard blocker to design around: the hook-trust prompt means a freshly
  installed hook is inert until the user interactively trusts it (or the installer documents
  running once with `--dangerously-bypass-hook-trust`, which is a scary flag name to put in
  installer-generated docs).

### 5. `codex exec` headless flags

- **VERIFIED-CURRENT**, from `https://developers.openai.com/codex/cli/reference` (fetched
  2026-07-03, full page text extracted) and `https://developers.openai.com/codex/noninteractive`.

  | Need | Flag | Notes |
  |---|---|---|
  | Sandbox mode | `--sandbox, -s {read-only\|workspace-write\|danger-full-access}` | Default when unset comes from config (`sandbox_mode`); non-interactive default sandbox is read-only per the noninteractive guide ("By default, `codex exec` runs in a read-only sandbox"). |
  | Writable root(s) beyond primary workspace | `--add-dir <path>` (repeatable) | **CAUTION — see below.** |
  | Working directory / sandbox root | `--cd, -C <path>` | Sets the workspace root before execution. **This, not `--add-dir`, is the actual write-fence boundary** (see finding below). |
  | Network | *(no direct on/off flag)* | Controlled via config only: `sandbox_workspace_write.network_access = true|false` (boolean, default false/no network in workspace-write mode). Set per-invocation with `-c sandbox_workspace_write.network_access=false` (or `=true` to allow). |
  | Approval / never-prompt | `--ask-for-approval, -a {untrusted\|on-request\|never}` — **but see flag-ordering bug below** | `never` is the documented non-interactive choice. `on-failure` is deprecated. |
  | Full bypass (no sandbox, no approval) | `--dangerously-bypass-approvals-and-sandbox` / `--yolo` | Explicitly documented as dangerous, "only use inside an externally hardened environment." |
  | Model | `--model, -m <string>` | e.g. `--model gpt-5.5`. |
  | Config override (escape hatch) | `-c, --config key=value` (repeatable) | Values parse as TOML if possible. |
  | Deprecated auto-approve alias | `--full-auto` | Still works but prints a deprecation warning; docs say prefer `--sandbox workspace-write`. |
  | Skip git-repo requirement | `--skip-git-repo-check` | Codex normally refuses to run outside a git repo — relevant since a Wienerdog vault directory may not be a git repo. |
  | Don't persist transcripts | `--ephemeral` | Skips writing rollout files for that run. |
  | Skip user config.toml | `--ignore-user-config` | Auth still uses `CODEX_HOME`. |

- **Verified gotcha #1 — flag ordering bug for `--ask-for-approval`**: as of `codex-cli 0.137.0`
  (and still true in the currently-documented CLI reference fetched today, which lists
  `--ask-for-approval` under "Global flags" but omits it from the `codex exec`-specific flag
  table), `--ask-for-approval`/`-a` is **rejected when placed after `exec`**:
  ```
  codex --ask-for-approval never exec --version   # OK, exits 0
  codex exec --ask-for-approval never --version    # error: unexpected argument `--ask-for-approval` found
  codex exec -a never --version                    # error: unexpected argument `-a` found
  ```
  This is an **open, unresolved** GitHub issue as of fetch time:
  https://github.com/openai/codex/issues/26602 (opened 2026-06-05, still open, last updated
  2026-06-06). The issue itself proposes the workaround Wienerdog should use: either put the flag
  *before* `exec` (`codex --ask-for-approval never exec ...`), or avoid the flag entirely and use
  `-c approval_policy=never` after `exec` (config overrides via `-c` are confirmed to work
  post-subcommand). **Recommendation for the WP: use `-c approval_policy=never` in the adapter's
  generated command, not `--ask-for-approval never` after `exec`, since the latter is documented
  in the CLI reference table as if it were global-and-universal but is not accepted by the actual
  parser in exec's positional-post-subcommand form.**

- **Verified gotcha #2 — `--add-dir` is not a reliable write fence; `--cd` is**: open GitHub
  issue https://github.com/openai/codex/issues/24214 (opened 2026-05-23, still open, reproduced
  on `codex-cli 0.133.0`) documents that when running
  `codex exec --sandbox workspace-write --add-dir <task-dir> --cd <broader-root>`, shell-based
  writes are correctly fenced to `<task-dir>` (+`/tmp`+`$TMPDIR`), but the agent's internal
  `apply_patch` tool (used for file edits) **ignores the `--add-dir` whitelist entirely** and can
  write anywhere under the broader `--cd` root. The reporter's conclusion, which the issue title
  echoes: "`--add-dir` is decorative for write fencing — only the `--cd` boundary actually
  constrains `apply_patch`." **Recommendation for the WP: to get the Claude-equivalent of
  `--add-dir <vault>` as a hard write boundary, Wienerdog's Codex adapter should invoke with
  `--cd <vault-dir>` as the actual working/sandbox root (not merely `--add-dir <vault-dir>` from
  a broader `--cd`), and treat `--add-dir` as at most a shell-command-level allowance, not a
  file-edit-level guarantee.** This is a live upstream bug/design gap, not settled behavior — flag
  it for re-check at spec-implementation time in case it's fixed before the WP ships.

- **Equivalent of the requested Claude Code invocation**:
  ```
  # Claude Code:
  claude -p "<prompt>" --tools Read,Write,Edit,Glob,Grep --permission-mode acceptEdits --add-dir <vault>

  # Codex CLI equivalent (recommended, given gotchas above):
  codex exec --sandbox workspace-write --cd <vault> -c approval_policy=never \
    -c sandbox_workspace_write.network_access=false --skip-git-repo-check "<prompt>"
  ```
  Note there is no per-tool allowlist flag analogous to Claude's `--tools Read,Write,Edit,...` —
  Codex's sandbox is filesystem/network-boundary-based (what paths/network are reachable), not a
  tool-name allowlist. There is no direct `codex exec` equivalent of restricting to specific tool
  names; the closest control surface is the sandbox mode + `rules`/`execpolicy` (`.rules` files,
  `--ignore-rules` to skip them) for allow/deny/prompt on command prefixes.

### 6. Rollout (session transcript) files

- **VERIFIED-CURRENT, confirmed directly against source code**, not just docs/blogs. From
  `openai/codex` repo, `codex-rs/rollout/src/recorder.rs`
  (https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/recorder.rs, fetched
  2026-07-03), function `precompute_log_file_info`:
  ```rust
  // Resolve ~/.codex/sessions/YYYY/MM/DD path.
  let mut dir = config.codex_home().to_path_buf();
  dir.push(SESSIONS_SUBDIR);              // "sessions"
  dir.push(timestamp.year().to_string());
  dir.push(format!("{:02}", u8::from(timestamp.month())));
  dir.push(format!("{:02}", timestamp.day()));
  // format_description!("[year]-[month]-[day]T[hour]-[minute]-[second]")
  let filename = format!("rollout-{date_str}-{conversation_id}.jsonl");
  ```
  So the confirmed exact path shape is:
  ```
  $CODEX_HOME/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<conversation_id>.jsonl
  ```
  (colons replaced with dashes in the embedded time-of-day, per an explicit code comment: "Use
  `-` instead of `:` for compatibility with filesystems that do not allow colons in filenames.")
  This matches your assumed format exactly — **confirmed still current** as of the `main` branch
  fetched today, and matches a doc example in the same file's module comment:
  `~/.codex/sessions/rollout-2025-05-07T17-24-21-5973b6c0-94b8-487b-a530-2aeb6098ae0e.jsonl` (note
  that particular doc-comment example omits the `YYYY/MM/DD` subdirectory nesting shown in the
  actual code — the code is ground truth, the doc comment above it is stale/imprecise about the
  nesting but correct about the filename pattern).
- `--ephemeral` on `codex exec` skips writing rollout files entirely for that run.
- Known related issue (context, not blocking): https://github.com/openai/codex/issues/21660
  (open, filed 2026-05-08) — rollout JSONL files and their parent directories are created with
  default Unix permissions (`0o644`/`0o755` under standard umask), i.e. **world-readable on
  multi-user Unix hosts**, unlike `~/.codex/history.jsonl` which is explicitly hardened to
  `0o600`. Relevant to Wienerdog's threat model if the vault or session transcripts might contain
  sensitive user content and the install target is a shared/multi-user machine — worth a
  one-line callout in the adapter spec's threat-model section, not a blocker.

# Implications for Wienerdog

1. **Skill install path differs fundamentally from a config-file write.** The Codex adapter must
   write/symlink skill directories into `$HOME/.agents/skills/<name>/` (or a repo-scoped
   `.agents/skills`), not edit `config.toml`. This should be reflected in the WP's Deliverables
   table (a directory-writing step) rather than a TOML-editing step, and in the install manifest
   for reversibility (uninstall = remove the directory/symlink, not revert a config diff).
2. **Global AGENTS.md write is a straightforward analog to the existing Claude Code CLAUDE.md
   managed-block approach** — same idempotent-write pattern should work, targeting
   `~/.codex/AGENTS.md`. Installer should check for a pre-existing `~/.codex/AGENTS.override.md`
   and warn if found (Wienerdog's content would be silently shadowed).
3. **Hooks: no AGENTS.md-digest fallback needed** — Codex's hook system is stable, enabled by
   default, and intentionally schema-compatible with Claude Code's hook events. The adapter can
   likely share a template/generator with the Claude Code hooks.json path with per-CLI syntax
   adjustments. Must account for the **hook-trust gate**: a freshly installed hooks.json is inert
   until the user runs `/hooks` to trust it (or the installer flow documents a one-time
   `--dangerously-bypass-hook-trust` run, which needs careful, non-scary framing in user-facing
   docs per this repo's plain-language convention).
4. **`codex exec` command-line construction has two live upstream footguns that the WP must
   design around, not just document**:
   - Use `-c approval_policy=never` (not `--ask-for-approval never` after `exec`) — the latter is
     currently rejected by the parser (issue #26602, open).
   - Use `--cd <vault>` as the actual sandbox/write root, not `--add-dir <vault>` from a broader
     `--cd` — `apply_patch` bypasses `--add-dir` (issue #24214, open, high severity for exactly
     Wienerdog's use case of fencing an agent to a vault directory).
   Both are open issues; whoever implements the WP should re-verify against the then-current
   `codex --version` before locking the exact invocation into code, since either could be fixed
   (or could regress further) before ship.
5. **No tool-name allowlist analog to `--tools Read,Write,Edit,Glob,Grep`.** The Codex sandbox
   model is boundary-based, not tool-based. Any Wienerdog design assuming per-tool restriction
   parity with Claude Code needs to be rethought for Codex — the closest lever is `execpolicy`
   `.rules` files (out of scope of this memo; flagged as an open question below).
6. **Multi-user host exposure**: rollout files (and their parent dirs) are world-readable by
   default (open issue #21660). If Wienerdog's Codex adapter causes vault content to flow through
   `codex exec` sessions on a shared machine, that content lands in a world-readable transcript
   unless the user has since patched/hardened this. Worth one sentence in the adapter spec's
   threat-model note; not a blocker for a single-user default install target.

# Open questions

- Exact `execpolicy` `.rules` file syntax (mentioned via `--ignore-rules` and a `rules.md` docs
  page under `/codex/rules`, not fetched in this pass) — needed if the WP wants tool-level
  restriction rather than only filesystem/network boundary restriction.
- Whether the Claude Code hooks.json schema (as currently implemented, not as of this memo's
  knowledge) is byte-for-byte identical to Codex's, or merely event-name-compatible with shape
  differences — needs a direct diff against Claude Code's current hook docs before assuming a
  shared template is viable.
- Whether `--add-dir`/`apply_patch` bypass (#24214) or the `--ask-for-approval` flag-ordering bug
  (#26602) get fixed before WP implementation — re-check `codex --version` changelog at
  implementation time.
- Exact behavior/interaction of `sandbox_workspace_write.exclude_tmpdir_env_var` and
  `exclude_slash_tmp` — both default `false` (i.e. `$TMPDIR` and `/tmp` are writable by default
  even in workspace-write mode), which is a second, separate write-fence leak beyond the
  `--add-dir`/`apply_patch` issue above, worth confirming whether it matters for the vault
  threat model (a malicious/buggy prompt could write to `/tmp` regardless of `--cd`/`--add-dir`).
- `windows.sandbox` (`unelevated`/`elevated`) and native-Windows sandbox specifics were not
  investigated — out of scope unless Wienerdog targets native Windows (not WSL2) for the Codex
  adapter.
