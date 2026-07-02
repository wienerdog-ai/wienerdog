---
type: research
date: 2026-07-02
topic: reconfig-ux
---

# Question

How do OpenClaw and Hermes Agent let users **reconfigure** the system after
initial install/onboarding — editing tone/identity, browsing/enabling/
disabling skills, changing schedules, adjusting memory settings? Wienerdog
needs a post-install "change my settings" story that is simpler than both
competitors. Candidates: (a) re-runnable in-harness conversational skill,
(b) CLI subcommands, (c) local browser GUI in v2.

Scope note: OpenClaw and Hermes Agent are both real, actively developed
products as of July 2026 (github.com/openclaw/openclaw,
github.com/NousResearch/hermes-agent). Findings below are from their current
docs/repos, fetched today, plus third-party comparison posts and GitHub
issues. Not all pages retrieved cleanly — gaps are flagged explicitly rather
than filled from recall.

# Findings

## OpenClaw

**1. Onboarding is re-runnable; `configure` is the targeted-edit command.**
`openclaw onboard` is the full guided flow (model auth, workspace, gateway,
channels, skills, health); re-running it does not wipe existing config unless
you explicitly pass `--reset` (default scope: config, credentials, sessions)
or `--reset-scope full` (adds workspace). `openclaw configure` is the
"change one thing" command — it takes a repeatable `--section` flag scoped to
`workspace | model | web | gateway | daemon | channels | plugins | skills |
health`; sections outside `gateway/daemon/health` skip the full wizard and go
straight to the relevant prompt.
Source: https://docs.openclaw.ai/cli/onboard, https://docs.openclaw.ai/cli/configure,
https://docs.openclaw.ai/start/onboarding-overview — confidence: verified-current
(fetched today; note the onboarding-overview fetch returned only partial
content — it did not surface reset/persona details, those came from the
`cli/onboard` and search-result pages instead).

**2. There is a persona-file stack, not a single SOUL.md control.**
OpenClaw's workspace bootstrap files: `SOUL.md` (personality/tone/boundaries
— "the most important bootstrap file"), `IDENTITY.md` (factual: name,
version, creator, capabilities), `USER.md` (context about the human),
`MEMORY.md` (knowledge). All are injected into the system prompt at
bootstrap. Users edit these as plain markdown files directly (no config-form
equivalent found for persona editing — the Control UI's "Config" tab edits
`openclaw.json`, not these markdown files). `openclaw agent prompt` lets you
preview the fully-assembled system prompt for debugging, which third-party
docs describe as "essential when the agent behaves unexpectedly" — implying
persona debugging is otherwise opaque.
Source: https://www.stanza.dev/concepts/openclaw-soul-persona,
https://www.stanza.dev/concepts/openclaw-persona-files,
https://docs.openclaw.ai/reference/templates/SOUL — confidence: recalled
from search-result summaries (third-party sites, not OpenClaw's own docs
directly fetched); the SOUL.md template URL is first-party but its content
was not directly fetched, only referenced in search snippets. Treat the
mechanism (separate files, direct edit, no GUI persona editor found) as
verified-current at moderate confidence, not the full prose.

**3. Control UI (`openclaw dashboard`, localhost web) is a real settings
surface with several editable areas**, confirmed via direct fetch of
docs.openclaw.ai/web/control-ui:
- **Config tab**: view/edit `~/.openclaw/openclaw.json` via `config.get`/
  `config.set`, both a schema-driven form mode and a raw JSON editor, with a
  base-hash guard against clobbering concurrent edits.
- **Skills**: toggle enablement on/off, install new skills, update API keys.
- **Cron panel**: list/add/edit/run/enable/disable scheduled jobs + run
  history, delivery mode (webhook/announcement/internal-only), model/
  thinking overrides, stagger, delete-after-run.
- **Sessions**: per-session model picker, thinking/fast/verbose/trace/
  reasoning overrides.
- **Dreaming**: enable/disable toggle + a "Dream Diary" reader (memory/
  consolidation browsing surface).
- **MCP settings page**: configured servers, enablement, OAuth/filter/
  parallel summaries.
- **Personal identity**: per-browser display name/avatar (stored in browser
  local storage) + assistant avatar override — this is cosmetic, not the
  agent's actual persona (SOUL.md).
- **Appearance**: theme, imported theme slots, text size (browser-local).
Notably: **no dedicated persona/SOUL.md editor was found in the Control UI**
— identity editing is file-based even though everything else (skills,
schedules, MCP, config) has a GUI form.
Source: https://docs.openclaw.ai/web/control-ui — confidence: verified-current
(fetched today, first-party).
Note: https://docs.openclaw.ai/web/dashboard was also fetched but only
covered auth/access (tokens, Tailscale, SSH tunnels), not feature content —
it explicitly deferred to control-ui for features, which matches what we
found there.

**4. Skill discovery is directory-convention-based, not registry-only.**
"OpenClaw discovers a skill whenever SKILL.md appears anywhere under a
configured root, and the folder path is for organization only." Skills also
install from ClawHub (public registry, browsable at clawhub.ai) via
`openclaw skills install @owner/<slug>`. Enable/disable happens in
`openclaw.json` under `skills.entries.<name>.enabled`, or via per-agent
allowlists (`agents.defaults.skills` / `agents.list[].skills`) that restrict
visibility regardless of installation location — i.e., there are *two*
places a skill's effective on/off state can be controlled (global enabled
flag vs. per-agent allowlist), which is a plausible confusion point.
Source: https://docs.openclaw.ai/tools/skills — confidence: verified-current
(fetched today, first-party).

**5. A known discovery bug**: GitHub issue reports that skills placed in
`workspace`/`extraDirs` were not discovered in version 2026.2.3-1 — only the
50 bundled skills appeared, despite the custom skill being physically
present on disk.
Source: https://github.com/openclaw/openclaw/issues/10386 — confidence:
recalled from search snippet, not directly opened; treat as
plausible-but-unverified detail (issue number and gist only).

## Hermes Agent

**1. No re-runnable onboarding wizard for post-install changes — CLI
subcommands + direct config-file editing is the entire story.**
`hermes setup [section]` exists (sections include `model`, `agent`) but the
documentation for post-install reconfiguration centers on:
- `hermes skills <browse|search|install|inspect|list|check|update|audit|
  uninstall|config|publish|tap>` — `skills config` is described as
  "interactive enable/disable configuration for skills by platform."
- `hermes memory <setup|status|off>` — provider setup is interactive;
  supported external providers: honcho, openviking, mem0, hindsight,
  holographic, retaindb, byterover, supermemory (built-in memory stays on
  if you turn an external provider off).
- `hermes config <show|edit|set>` — `edit` opens `config.yaml` directly in
  `$EDITOR`; `set <key> <value>` does scripted point-edits.
- `hermes cron <list|create|edit|pause|resume|run|remove|status|tick>` for
  scheduling.
Source: https://hermes-agent.nousresearch.com/docs/reference/cli-commands/
— confidence: verified-current (fetched today, first-party).

**2. Persona/tone: built-in named personalities plus custom ones defined in
YAML, switched via slash command.**
In-session: `/personality [name]` switches among built-ins (e.g. "pirate",
"kawaii", "concise"). Custom personalities are authored under
`agent.personalities` in `~/.hermes/config.yaml` — i.e., defining a new
persona requires hand-editing YAML, but *switching* between already-defined
personas is a one-line slash command. No GUI equivalent found; TUI is
text-only (`hermes --tui`, described as having "multiline editing,
slash-command autocomplete, conversation history, interrupt-and-redirect,
streaming tool output").
Source: search-result synthesis referencing
https://hermes-agent.nousresearch.com/docs/user-guide/cli — confidence:
recalled (direct fetch of the personality.md file 404'd from a malformed
URL; this claim is from the WebFetch summary of the CLI user-guide page,
first-party, but not independently cross-checked against the raw
personality.md source).

**3. A real, closed GitHub issue documents a config-safety bug that is
directly relevant to "reconfigure without breaking things": Hermes would
silently rewrite a user's minimal, hand-authored `config.yaml`** into a
large, fully-expanded file with environment-variable placeholders
(`${GLM_API_KEY}`) resolved to their literal secret values, whenever a
config-changing command ran — because some code paths loaded the *merged
runtime config* (defaults + expanded secrets) and wrote that whole object
back to disk instead of patching only the touched keys. Root cause: no
separation between "raw user-authored file" and "effective runtime config."
Opened 2026-04-03, since closed; submitter offered to contribute the fix
(patch only owned keys, never re-serialize defaults or expand secrets).
Source: https://github.com/NousResearch/hermes-agent/issues/4775 —
confidence: verified-current (fetched today, first-party GitHub issue).
**Implication**: any config-file-based reconfig UX (ours or theirs) has a
sharp edge — round-tripping a config file through "load merged → mutate →
write back" leaks secrets and destroys minimalism. Wienerdog's installer
must never do this to CLAUDE.md/settings.json.

**4. Related open feature request** underscores that skills-as-config is
still evolving: issue #52773 asks for per-profile default skills in
`config.yaml` (skills that auto-load every time a given profile launches,
today only achievable via the `-s`/`--skills` flag per invocation, or by
telling the agent about them via SOUL.md/prompt text — described as "token-
burning and unreliable").
Source: https://github.com/NousResearch/hermes-agent/issues/52773 —
confidence: recalled from search snippet, not directly opened.

**5. "Grows with you" memory/skill-generation is opt-in, and users don't
realize it by default.** A common complaint captured in third-party
comparison writeups: without explicitly enabling persistent memory and
"skill_generation" in config, Hermes behaves like an ordinary single-session
agent, undercutting its own tagline. This is a discoverability failure, not
a technical one.
Source: https://hostadvice.com/blog/ai/hermes-agent-vs-openclaw/,
https://medium.com/@sathishkraju/i-switched-from-openclaw-to-hermes-agent-heres-what-nobody-told-me-5f33a746b6ca
— confidence: recalled (third-party blog synthesis, not first-party docs;
directionally credible since it matches the opt-in provider list in memory
docs, but not independently verified against Hermes's own onboarding copy).

## Cross-cutting friction findings (both products)

- **OpenClaw's dominant complaint is operational, not settings-UX**: users
  report spending more time on infrastructure (Docker, SSH, YAML, security
  hardening, uptime babysitting) than on actual agent workflows, and that
  roughly 1-in-4 updates break response delivery, cron jobs, or webhooks,
  attributed to no staging/testing discipline on OpenClaw's release process.
  This is upstream of "how do I change a setting" — it's "will changing
  anything, including via an update, break what already works."
  Source: search-snippet synthesis (specific origin blog not re-verified)
  — confidence: recalled, moderate confidence given it recurs across
  multiple independent comparison articles found in the same search.
- **Hermes's sharpest friction is the initial auth-token save**, not
  reconfiguration per se: missing the printed token means re-running the
  full OAuth flow. Not directly relevant to the reconfig question but shows
  the CLI-first UX pattern extends its rough edges into "redo the whole
  thing" territory when a step is missed.
  Source: https://hostadvice.com/blog/ai/hermes-agent-vs-openclaw/ —
  confidence: recalled.
- **Discovery of "what's configurable" differs sharply by product**:
  OpenClaw surfaces it visually (Control UI tabs = the menu of configurable
  things: Config/Skills/Cron/Sessions/Dreaming/MCP/Appearance — a user can
  browse the dashboard nav to find out what exists). Hermes surfaces it only
  through `hermes --help` / `hermes <noun> --help` CLI discovery and reading
  `config.yaml`/docs — there is no visual "menu of everything you can
  change." One Hermes doc reference explicitly says memory-provider activity
  "may register extra provider-specific top-level subcommands — run
  `hermes --help` to see what is wired today," i.e., the CLI's own surface
  area is dynamic and self-describing only via `--help`, not documented
  exhaustively in one place.
  Source: https://hermes-agent.nousresearch.com/docs/reference/cli-commands/,
  https://docs.openclaw.ai/web/control-ui — confidence: verified-current for
  both underlying facts; the comparative framing ("visual menu vs. --help
  archaeology") is this researcher's synthesis, not a quoted source claim.

# Implications for Wienerdog

**Simplest credible v1 reconfig story**: a re-runnable in-harness
conversational skill (candidate (a)), NOT CLI subcommands, for these
reasons drawn from the findings above:

1. Both competitors' "menu of settings" problem is real and self-inflicted.
   Hermes has no visual menu at all (discovery = `--help` archaeology);
   OpenClaw solved discovery with a whole second surface (Control UI web
   app) that duplicates the CLI's config model and needs its own auth/
   tunnel/security story (finding 3, `web/dashboard`). Wienerdog's ADR-0004
   ("just files, no daemons/servers") rules out an OpenClaw-style localhost
   dashboard for v1 outright — that's the correct call; it also removes an
   entire class of bugs (base-hash write races, token/tunnel security
   surface) neither competitor has fully tamed.
2. A conversational reconfigure skill run inside the existing harness (`/wd
   configure` or similar) can *be* the discovery mechanism: the skill's own
   prompt can enumerate "here's what you can change: tone/identity, skills,
   schedules, memory settings" every time it runs, which solves Hermes's
   worst problem (no menu) without building OpenClaw's whole second app.
3. **Concrete danger to avoid, proven by Hermes issue #4775**: never
   implement reconfig by loading a fully-merged/expanded config, mutating
   it, and writing the whole thing back. Wienerdog's installer/reconfigure
   skill must patch only the specific keys/blocks a user is changing in
   CLAUDE.md/settings.json/skill frontmatter, and must never round-trip
   through a "resolved defaults + expanded secrets" representation. This is
   directly checkable against the idempotent/reversible requirement already
   in CLAUDE.md — worth a literal test case ("reconfigure one setting,
   assert the rest of the file is byte-identical").
4. **Persona/identity editing should stay file-based** (matches OpenClaw's
   own choice not to GUI-ify SOUL.md even though everything else has a
   form) — but the reconfigure skill should offer to *open and walk through*
   the identity file conversationally rather than requiring users to
   hand-edit markdown blind, which is a real gap in both competitors (no
   guided persona editor exists in either product; OpenClaw's own
   `agent prompt` debug command exists specifically because persona editing
   is otherwise opaque).
5. Skills enable/disable is the one place a *list-and-toggle* CLI/skill
   output is clearly warranted (both competitors converge on this being a
   distinct, list-shaped operation — OpenClaw's Skills tab, Hermes's
   `skills config`) — the conversational skill can render this as a simple
   numbered list with on/off state and take a "toggle N" reply, no GUI
   needed.

**What a v2 GUI must minimally cover** (if/when Wienerdog builds one,
learning from what OpenClaw's Control UI got right and where it adds
overhead):
- Must ship as a **local, on-demand static viewer** (open a file / run a
  throwaway `python -m http.server`-style one-shot, not a persistent
  gateway daemon) — anything resembling OpenClaw's always-on Control UI
  with token auth, tunnel guidance, and base-hash write races violates
  ADR-0004 and imports a security surface (auth tokens, sessionStorage,
  Tailscale/SSH tunnel docs) Wienerdog does not want.
- Minimum feature parity to be worth building at all: config form +
  skills enable/disable list + schedule (cron-equivalent) list/edit +
  memory/vault browser — this is exactly OpenClaw's Config/Skills/Cron/
  Dreaming tab set, which is the closest thing to a validated "these are
  the things users expect to see in a settings GUI" list currently in the
  wild.
- Should NOT try to replicate OpenClaw's MCP-server tab, appearance/theme
  settings, or per-browser cosmetic identity (avatar/display name) — those
  are scope creep relative to what Wienerdog's product actually has
  (no MCP marketplace, no multi-user browser sessions).
- Persona/SOUL.md-equivalent editing: still no existing product has solved
  this with a good GUI form (both leave it as raw markdown). A v2 GUI adding
  a real guided persona editor (not just a raw-text box) would be a genuine
  differentiator, not just parity.

# Open questions

- Did not find OpenClaw's own first-party post-onboarding "what changed on
  re-run" documentation (the `onboarding-overview` fetch returned only
  partial content) — worth a follow-up fetch of
  https://docs.openclaw.ai/reference/wizard directly if this detail becomes
  spec-relevant.
- Hermes personality.md source file 404'd at the URL guessed from search
  results (github path likely differs from
  `website/docs/user-guide/features/personality.md` — need the actual repo
  tree, not a guessed path) — the personality-switching claim (finding 2) is
  moderate-confidence, not high.
- No first-party OpenClaw or Hermes Reddit/HN threads were directly opened
  (search returned zero indexed Reddit results for OpenClaw specifically);
  the operational-friction and update-breakage claims rest on third-party
  comparison blogs (hostadvice.com, Medium posts, kilo.ai) whose own
  sourcing (e.g., "1,300 Reddit comments analyzed") was not independently
  verified. Treat the "25% of updates break something" figure as an
  unverified third-party claim, not a confirmed statistic.
- Have not checked whether OpenClaw's Control UI or Hermes's TUI have
  changed materially since this fetch — given the standing platform-drift
  beat, a recheck before Wienerdog's own v2 GUI spec is finalized would be
  prudent, since both products are under active, fast-moving development
  (Hermes issue #4775 alone shows April 2026 churn).
