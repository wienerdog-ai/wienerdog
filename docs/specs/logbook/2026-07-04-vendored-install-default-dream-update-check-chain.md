---
date: 2026-07-04
title: Vendored-install + default-dream + update-check chain
related_wps: [WP-042, WP-043, WP-044, WP-045, WP-046, WP-047]
---

# Vendored-install + default-dream + update-check chain (2026-07-04)

**Vendored-install + default-dream + update-check chain (2026-07-04).** WP-042→046
form a serial chain implementing three owner decisions (ADR-0013/0014/0015).
WP-042 vendors the package into `~/.wienerdog/app/<version>/` behind a stable
`app/current` symlink so scheduler entries stop pointing at the ephemeral npx
cache, AND writes a `~/.local/bin/wienerdog` shim (bare `wienerdog` resolved
nowhere on real installs — a pre-existing P1 that broke every gws routine).
WP-043 migrates the two live installs' existing schedules onto that stable path
(via `sync`, the canonical update command). WP-044 then schedules
the nightly dream by default the moment a vault is created (silent, 03:30),
which also seeds the update-check cache each night. WP-045 builds the bounded,
opt-out, semver-validated update-check module; WP-046 wires its refresh into
`run-job` and renders the cached notice into the digest + `doctor`, and adds
THREAT-MODEL T7 plus the deferred `alerts.jsonl` injection-surface note. The
chain is linear because these WPs share `sync.js`, `schedule.js`, `init.js`,
`run-job.js`, and `digest.js`; serializing them avoids merge conflicts and lets
each build on the prior contract. **WP-047** branches off WP-042 (it needs the
vendored `app/` dir + shim): it installs `googleapis` on demand — with consent,
once — into `~/.wienerdog/app/deps/` and routes the gws require through a deps-dir
seam with a plain "run /wienerdog-google-setup" error, so gws works from the
node_modules-free vendored copy. It shares no files with WP-043→046 and can land
in parallel after WP-042.
