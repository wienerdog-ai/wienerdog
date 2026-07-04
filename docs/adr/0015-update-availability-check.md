# ADR-0015: Update-availability check — bounded, cache-rendered, opt-out, never auto-update

Status: Accepted
Date: 2026-07-04

## Context

Wienerdog will ship often, and the installed layout is the public API (ADR-0003).
Users who installed once via `curl … | bash` have no ambient signal that a newer
version exists — npx pins nothing on their machine. We need to tell users "a
newer Wienerdog is available" without violating the iron rule (ADR-0004: just
files, no process, no telemetry) and without opening an injection channel into
the digest (the WP-041 rule: nothing untrusted may flow into the injected
context).

## Decision

Wienerdog performs a **bounded, opt-out version check** and renders a
cache-only "update available" line. No new process; no auto-update.

1. **No new process.** The check piggybacks on work that already runs: scheduled
   `run-job` invocations, and interactive CLI commands. Nothing is spawned or
   kept alive for it.
2. **At most once per 24h.** A refresh performs a single HTTPS GET to the npm
   registry for the package's `latest` dist-tag, with a **bounded timeout**, and
   writes the result to `~/.wienerdog/state/update-check.json`. The `last_check`
   timestamp is stamped on every *attempt* (success or failure), so a transient
   failure cannot cause a retry storm. Failure is a **silent skip** — it never
   blocks or fails the job or command.
3. **The SessionStart digest hook never networks** (<200 ms budget). The
   "update available" line is rendered **from the cache only**, by
   `renderDigest` (into the injected digest) and by interactive CLI output
   (`doctor`, `sync`). The line quotes the exact update command **verbatim**:
   `npx wienerdog@latest sync` (ADR-0013).
4. **Never auto-update.** Wienerdog only ever *tells* the user; updating is the
   user running the printed command.
5. **Opt-out, default on.** `update_check: false` in `config.yaml` disables the
   refresh entirely (default: on). Documented in plain language.
6. **Untrusted response, validated.** The registry response is untrusted input.
   The returned version string is validated as **semver-shaped** before it is
   stored or rendered, and only a **fixed-template, declarative control-plane
   line** is emitted — no registry-supplied text flows into the digest verbatim.
   This preserves the WP-041 property that nothing untrusted reaches the
   injected context.

## Consequences

- Users learn about new versions through a channel they already read (the
  session digest) and through `doctor`/`sync`, with the exact one-line fix.
- A single outbound registry GET now exists on scheduled/interactive paths. It
  is **disclosed** in THREAT-MODEL (T7): it sends no user data beyond a standard
  HTTPS request (no identifiers, no vault content), is bounded, fails silent,
  and is fully opt-out. It is not telemetry, but it is honestly documented as an
  outbound call so the "no network except what you configured" claim stays true
  with a named, opt-out exception.
- ADR-0004 holds: no daemon, no polling loop, nothing that outlives its job.
- Tests must never touch the real registry: the fetch is behind an injectable
  seam and an env override, and the network path is off by default in the test
  fixtures (see WP-045/WP-046).
