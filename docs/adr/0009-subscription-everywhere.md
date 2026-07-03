# ADR-0009: Subscription auth everywhere — no Anthropic API keys

Status: Accepted
Date: 2026-07-03

## Context

ADR-0004 already commits the *product* to running scheduled intelligence through the user's own subscription (`claude -p` / `codex exec`), never an API key. But the project's own **test infrastructure** violated that stance: the scenario harness (WP-015) and its nightly GitHub-Actions workflow authenticated with an `ANTHROPIC_API_KEY` secret. The reason was mechanical, not deliberate — the harness isolated `CLAUDE_CONFIG_DIR` to a temp dir so its fixture transcripts would be discovered there, and subscription/OAuth credentials are Keychain-bound to the user's **default** config dir, so they never reached the isolated brain. An API key was the only thing that worked. That left the project depending on a credential type its own product refuses to use, and gave the harness no coverage of the subscription code path the product actually ships.

## Decision

The project runs on **subscription auth everywhere**. No Anthropic API keys appear in the product or in the project's own test infrastructure. Scenario execution — the one place that spends real model quota — becomes a **locally scheduled subscription routine on the maintainer's machine**, running the brain and the Haiku grader through `claude -p` on the maintainer's subscription (dogfooding the product's own scheduler). The nightly GitHub-Actions scenario workflow is **demoted to a dormant, opt-in path** for future contributors: it is disabled by default (manual dispatch only, no `schedule`) and is the *only* place an API key could ever appear — explicitly excluded from the maintainer's own setup — because GitHub Actions cannot perform subscription OAuth.

## Consequences

- The scenario harness must **decouple fixture isolation from auth**: fixtures are fed to the collect phase through a wienerdog-internal override, while the brain child resolves the user's *real* default config dir (real `HOME`, un-overridden `CLAUDE_CONFIG_DIR`) so OAuth works. The harness must also actively strip `ANTHROPIC_API_KEY` from every child env, so a stray key in the maintainer's shell can never silently take over.
- CI can no longer run scenarios headlessly (no OAuth in Actions). The safety net for a gating regression moves from "the nightly turns red the next morning" to "the maintainer's next local scheduled run fails loud." Accepted: the injection-gating claim is verified locally on subscription, not in cloud CI.
- Scheduled jobs (`run-job`, WP-020) must rely on `HOME` + default `CLAUDE_CONFIG_DIR` resolution for subscription auth rather than an API key. Whether the login Keychain is reachable in a launchd/systemd session is a **verify-at-first-live-run** item; WP-020's fail-loud path covers a failure. A follow-up should remove `ANTHROPIC_API_KEY` from `run-job`'s env allowlist to fully align; it is noted, not done here.
- The single ADR-approved runtime dependency exception (`googleapis`, ADR-0003 lineage) is unaffected; this ADR is about *model* auth, not Google auth.
