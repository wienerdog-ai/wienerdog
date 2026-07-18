---
date: 2026-07-17
title: Security-audit A0 freeze chain
related_wps: [WP-083, WP-109, WP-110, WP-111, WP-112, WP-113]
---

# Security-audit A0 freeze chain (2026-07-17)

**Security-audit A0 freeze chain (2026-07-17, `docs/security-audit/2026-07-15`).**
The 2026-07-15 consensus audit's first required action — **A0, "ship a fail-closed
pre-use safety profile"** — is split into five WPs so a fresh install cannot
foot-gun the user before the deeper P0 fixes (A1–A6) land. The defect A0 addresses:
Wienerdog *infers* safety from file presence (a Google token → gws works; a
`skill:` line in config.yaml → a routine runs; a daily `## Summary` → it is
injected), with no explicit record of whether a feature is cleared. **WP-109**
(foundation, independent) adds a code-owned **safety profile**
(`src/core/safety-profile.js`) — five **capability gates**, all BLOCKED, with **no
runtime/env/flag override** (the fail-closed property: a partial config can never
be mistaken for approved) — plus a read-only `wienerdog safety` preflight and the
GLOSSARY terms. It changes no feature behavior; it is the primitive the three
gating WPs consume (WP-083 "ship the registry first" precedent). The gates are then
wired at the exact side-effect sites, split by code region so each is a small,
single-region, independently reviewable change: **WP-110** (`src/gws/index.js`)
fails `gws auth` (`google-setup`) and every credential-using verb (`gws-use`)
closed before a token load or the OAuth browser; **WP-111** (`schedule.js` +
`run-job.js`) fails a `skill:` routine (`external-content-routine`) closed at both
the `schedule add --skill` creation path and the `run-job` skill-dispatch path,
before a model spawn (`builtin:dream` stays allowed); **WP-112** (`digest.js` +
`dream/validate.js`) removes the daily `## Summary` from the injected digest
(`daily-summary-injection`) and reverts any dream change to the four injected
identity files (`identity-auto-activation`), while leaving the human setup
interview and the rest of the dream (proposal/report mode) untouched. All three
gating WPs hard-depend WP-109 and are mutually independent (disjoint files) — they
land in parallel. **WP-113** (docs-only, depends on all four) scopes the
README/VISION/THREAT-MODEL claims to the enforced boundary and adds a THREAT-MODEL
**T0** section (audit "Required documentation changes"). The gate is injectable in
tests only as a **code seam** (a `profile` function argument), never via env/argv —
matching `grant.js`'s `openTty` precedent and A0's "no generic `--yes`/environment
override for a red gate". No new ADR: the WPs implement the audit's A0 within
ADR-0004/0005; the fail-closed convention is recorded in WP-109 + GLOSSARY. **No
intermediate green authorizes use** — P0 completion (A0–A6 + a clean-commit audit
rerun + an explicit human go) permits only a limited local, Google-disabled,
dream-only evaluation profile.
