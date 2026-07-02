---
type: research
date: 2026-07-02
topic: googleworkspace-cli
---

# Question

Should Wienerdog replace its planned self-built `gws` module (~600 LOC over
the `googleapis` npm package, per `docs/ARCHITECTURE.md` §"Google Workspace")
with the official-org `googleworkspace/cli` Rust tool (npm alias
`@googleworkspace/cli`, binary `gws`) — wholesale, not at all, or in some
hybrid form? Gyula uses this CLI personally today and is satisfied with it,
with one known footgun: `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` must be
set on every invocation or credential storage silently breaks.

# Findings

**1. What it is / maintenance status**
`googleworkspace/cli` (GitHub org `googleworkspace`) is a Rust CLI (~99% Rust)
that dynamically generates its command surface from Google's Discovery
Service, so new API methods appear automatically without a CLI release. It
covers Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, Tasks, Events, Apps
Script, Workflows, plus "Model Armor" response sanitization and 40–100+
bundled AI-agent skills (`skills/gws-*/SKILL.md`). Install paths: prebuilt
binary via GitHub Releases (recommended), `npm install -g @googleworkspace/cli`
(npm package runs a postinstall that fetches the platform binary — as of
v0.22.5 with SHA256 checksum verification), `cargo install`, Homebrew, Nix.
License: Apache-2.0, no anti-wrapping/redistribution clauses found.
Explicitly **not an officially-supported Google product** despite living
under the `googleworkspace` org and being covered by MarkTechPost as a
"Google AI team" release; repo carries a pre-1.0 "expect breaking changes"
disclaimer. Visible release history tops out at **v0.22.5 (2026-03-31)**
with a dense cluster of releases Mar 18–31, 2026; I found no evidence of any
release between April and July 2026 in what WebFetch surfaced — this is a
gap in what I could verify, not confirmed evidence of a slowdown; flag as
unconfirmed if this matters to the decision.
Sources: https://github.com/googleworkspace/cli (fetched 2026-07-02),
https://github.com/googleworkspace/cli/releases (fetched 2026-07-02),
https://www.marktechpost.com/2026/03/05/google-ai-releases-a-cli-tool-gws-for-workspace-apis-providing-a-unified-interface-for-humans-and-ai-agents/
(fetched 2026-07-02). Confidence: verified-current for repo/README/release
content as rendered; the "no April–June releases" claim is inferred from an
absence, not a positive confirmation — WebFetch summarizes/truncates, so
recheck directly if this becomes decision-relevant.

**2. Capability coverage vs. our needs — includes verbs we deliberately excluded**
Helper commands (prefixed `+` to avoid colliding with Discovery-generated
method names): Gmail `+send`, `+reply`, `+reply-all`, `+forward`, `+triage`,
`+watch`, plus raw Discovery access to drafts/threads/labels/history/settings.
Calendar: `+insert` (create events — sends real invites), `+agenda`. Drive:
`+upload`, plus raw Discovery search/get/download. Global flags: `--format
json|table|yaml|csv` (JSON default), `--dry-run`, `--sanitize <template>`
(Model Armor PII/prompt-injection filtering), `--page-all` (NDJSON streaming
pagination), `--page-limit`, `--page-delay`.
**Critical mismatch**: our architecture's `gws` deliberately has **no send
verb** and Calendar `draft-event` deliberately never sends invites (ADR-level
governance decision, ARCHITECTURE.md line 157). The real `gws gmail +send`
and `gws calendar +insert` do exactly what we excluded — real send, real
invites. Adopting the official CLI as-is would hand the agent capabilities
our design specifically withholds; we could not point the agent at raw `gws`
without an allowlist/wrapper layer blocking those verbs.
Sources: README and `skills/gws-gmail/SKILL.md`, both fetched 2026-07-02 via
WebFetch of https://github.com/googleworkspace/cli/blob/main/README.md and
.../skills/gws-gmail/SKILL.md. Confidence: verified-current.

**3. Auth model — does NOT remove the per-user OAuth-client burden**
`gws` ships **no embedded/shared OAuth client**. Two paths, both requiring
the user to own a Google Cloud project and OAuth client, identical in kind to
our current guided-Console design: (a) `gws auth setup` — automated, but
**requires the `gcloud` CLI to already be installed**, an extra dependency
most non-technical users won't have; (b) manual OAuth setup through Cloud
Console, i.e. the same clicking-through-Console flow our
`/wienerdog-google-setup` skill already walks users through. Non-interactive
alternatives: service account via `GOOGLE_APPLICATION_CREDENTIALS` /
`GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`, or a pre-obtained token via
`GOOGLE_WORKSPACE_CLI_TOKEN`. The "recommended" scope preset is **85+
scopes** — far broader than the 4 scopes our design requests
(`gmail.readonly`, `gmail.compose`, `calendar`, `drive.readonly`); scopes must
be manually filtered (`gws auth login -s drive,gmail,calendar`) to avoid
tripping the ~25-scope cap Google enforces on unverified/testing-mode apps
and to respect least-privilege on the consent screen.
**Conclusion: adopting `gws` does not reduce OAuth setup friction for a
non-technical user** — it adds a new external binary to install (Rust
binary; no toolchain needed for prebuilt path, but still a new artifact
outside `npm`/our zero-runtime-dependency Node CLI) without removing the
Cloud Console step.
Sources: README (fetched 2026-07-02), `skills/gws-shared/SKILL.md` (fetched
2026-07-02). Confidence: verified-current.

**4. Credential storage / the keyring footgun — confirmed and directly
relevant to our launchd scheduler**
Confirmed: `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND` is a real, documented env
var. Default backend is the OS keyring (macOS Keychain / Windows Credential
Manager / libsecret); setting `=file` stores the AES-256-GCM encryption key
at `~/.config/gws/.encryption_key` instead. Two **open, unresolved** GitHub
issues confirm real breakage, not hypothetical risk:
- **Issue #367** ("macOS Keychain write silently fails: credentials.enc
  written but decryption key never saved", v0.9.1): on macOS accounts without
  an initialized login Keychain — **exactly the profile of a launchd
  agent/service context, i.e. our scheduled-job use case** — the Keychain
  write silently fails, `gws` reports success, and every subsequent read
  fails with an unexplained 401. This is very likely the mechanism behind
  Gyula's "bare invocation self-deletes credentials" experience: not
  deletion per se, but a silent write-failure that leaves stored credentials
  unreadable, which looks the same in practice (re-auth required).
- **Issue #791** (opened 2026-05-12, still open): even when
  `keyring_backend: "keyring"` is reported active, the CLI re-writes the
  32-byte encryption key to `~/.config/gws/.encryption_key` on *every*
  invocation regardless of backend setting, co-located with the ciphertext —
  defeating the purpose of the OS keyring and reported as a security bug by
  the maintainers' own tracker.
No maintainer fix or acknowledgment was visible in what I could fetch for
either issue as of 2026-07-02.
**Implication**: `file` backend (forcing the env var on every call, as Gyula
already does) is the *only* backend that behaves predictably in a
non-interactive/headless context (launchd, cron, systemd). This is a
load-bearing operational fact for any Wienerdog job that would shell out to
`gws`, not a personal quirk to work around per-user — it must be baked into
whatever wrapper invokes `gws`, every time, with no reliance on default
behavior.
Sources: https://github.com/googleworkspace/cli/issues/367 (fetched
2026-07-02), https://github.com/googleworkspace/cli/issues/791 (fetched
2026-07-02, opened 2026-05-12). Confidence: verified-current for issue
existence/content as rendered; the causal link to Gyula's specific
"self-deletes" description is inferred, not confirmed by an issue that uses
that exact wording — I found no issue titled or described as literal
self-deletion.

**5. Headless suitability**
Once token-cached, `gws` calls are non-interactive and JSON-first by
default — good fit for `claude -p` / `run-job` style headless invocation.
Pagination flags (`--page-all` NDJSON, `--page-limit`, `--page-delay`) and
`--dry-run` suit scripted/agent use. No documented `--no-browser` flag or
refresh-token-specific env var beyond the service-account and raw-token
paths already listed in Finding 3; nothing beyond what's already noted about
the keyring default being unsafe for non-interactive contexts (Finding 4).
Sources: README, fetched 2026-07-02. Confidence: verified-current for what's
documented; absence of a documented cron recipe is a gap, not a claim it's
unsupported — the bundled `skills/gws-*` docs may cover this in files I did
not fetch.

**6. Licensing/redistribution and risk profile**
Apache-2.0, no restriction on wrapping or redistributing found. Wienerdog
could, consistent with "never silently install software," add a guided,
opt-in install step (equivalent to today's `/wienerdog-google-setup` skill)
that offers to `npm install -g @googleworkspace/cli` or points to the
Releases page, rather than bundling it as a `package.json` dependency (which
would also violate the zero-runtime-dependency rule and pull in a Rust
binary via postinstall). Risk profile for a young, pre-1.0, actively-churning
project (dense release cadence through March 2026, unresolved credential
bugs affecting exactly our headless use case) is materially higher than our
own ~600 LOC module, which we fully control and test. No deprecation
history exists yet since the project is <1 year old by inference from the
version numbering and "expect breaking changes" disclaimer; this is itself
the risk — we'd be pinning Wienerdog's Google integration to an external
project that has not yet reached API/CLI-surface stability.
Sources: LICENSE file (fetched 2026-07-02). Confidence: verified-current for
license text; recalled/inferred for the "young project" risk framing.

# Implications for Wienerdog

- **Do not expose raw `gws` to the agent.** Its `+send` and `+insert` verbs
  do exactly what ADR-level governance in ARCHITECTURE.md (line 157)
  deliberately excludes. Any integration requires an allowlist/wrapper layer
  blocking those verbs — this reintroduces most of the engineering our
  self-built module already does (command surface control), just relocating
  the HTTP-plumbing savings to "call an external binary" instead of "call
  `googleapis`."
- **No OAuth-friction win.** `gws` ships no shared/embedded OAuth client;
  users still need a Cloud Console project (`/wienerdog-google-setup`'s job
  today) or `gcloud` installed for the faster path — an *extra* dependency,
  not fewer steps, for a non-technical user.
- **The keyring env-var footgun is real, open, and specifically dangerous
  for our scheduler.** If Wienerdog ever shells out to `gws` from a launchd
  job, `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` must be hardcoded into the
  job's env every time (per `run-job`'s "build a clean env explicitly"
  principle already in ARCHITECTURE.md line 169) — the default keyring
  backend has an open, unresolved silent-failure bug (#367) in exactly the
  no-interactive-session context launchd agents run in.
- **Recommendation: (b) keep the self-built `googleapis` module.** For
  Wienerdog's current narrow surface (Gmail search/read/draft, Calendar
  list/show/draft-event, Drive search/read — deliberately no send/no
  invites), the self-built ~600 LOC module remains simpler, fully within our
  control, has no external binary/toolchain dependency, and isn't exposed to
  an actively-churning pre-1.0 project's unresolved credential bugs. Revisit
  as (c) hybrid — using `gws` purely as an installed, wrapped backend behind
  our own allowlist — only if/when Wienerdog's Workspace scope grows to want
  Sheets/Docs/Chat/dynamic-Discovery breadth `googleapis`-direct would make
  expensive to hand-roll, and only after `gws` reaches a stated v1.0 with the
  credential bugs closed. No action needed on ARCHITECTURE.md §"Google
  Workspace" beyond a footnote citing this memo if the architect wants one;
  I am not proposing a text change myself.

# Open questions

- Whether issues #367 and #791 have shipped fixes after 2026-07-02 (both were
  open as of this fetch; #791 opened only 2026-05-12, so likely still fresh).
- Whether `gws`'s bundled `skills/gws-*/SKILL.md` files document a specific
  cron/launchd/headless recipe I didn't fetch (I only pulled `gws-gmail` and
  `gws-shared`) — worth a follow-up fetch of `skills/gws-calendar/SKILL.md`
  and any `docs/headless.md`-equivalent if this tool is revisited.
- Whether the "no releases visible April–June 2026" observation reflects a
  real slowdown or just WebFetch's rendering/summarization — worth a direct
  `gh api repos/googleworkspace/cli/releases` check if release cadence
  becomes decision-relevant.
- Exact scope classification (sensitive vs. restricted) gws's Gmail/Calendar/
  Drive helper scopes fall under was not confirmed from primary Google
  sources in this pass — I relied on the existing ARCHITECTURE.md assumption
  (test-mode caps at 100 users / 7-day token expiry) and only re-verified
  that policy is still current as of 2026-07 via Google's own support
  articles (https://support.google.com/cloud/answer/15549945 and
  https://support.google.com/cloud/answer/7454865, fetched 2026-07-02) — it
  applies identically whether the OAuth client backs our module or `gws`,
  since both use a per-user Cloud Console client.
