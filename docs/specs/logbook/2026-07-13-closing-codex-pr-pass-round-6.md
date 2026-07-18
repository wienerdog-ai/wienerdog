---
date: 2026-07-13
title: Closing Codex PR pass, round-6
related_wps: [WP-102, WP-103, WP-104]
---

# Closing Codex PR pass, round-6 (2026-07-13)

**Closing Codex PR pass, round-6 (2026-07-13, two findings; deps.js + prompt.js +
doctor.js):** **P1 (high user-visibility, stdout hygiene)** — the self-heal wrote
its notice, consent prompt, and npm output to STDOUT, corrupting a connected
user's `gws … --json | jq` (and, with stdout piped + a TTY stdin, the prompt was
written into the pipe, invisible, while it waited). Routed ALL chatter to stderr:
notice → `process.stderr.write`; npm → `defaultRunInstall` `stdio: ['inherit', 2, 2]`;
prompt → a new backward-compatible `opts.output` on `confirm` that
`ensureGoogleapis` sets to stderr (grows WP-102 by `src/core/prompt.js` + test).
**P2 (classification gap the §0 rewrite opened)** — a package.json-present-but-
unresolvable (missing-main) tree made `resolveFromDeps` throw → `isInstalled`
false → classified ABSENT → self-heal `npm`-over-corrupt → arborist no-op → loop
again. Re-keyed the absent/broken split AND the self-heal gate onto **physical
presence** (`depsPresent`, the §0 existence check, now exported): every present-yet-
unusable state (resolve-throw/require-throw/shape-fail/symlink-out) classifies
broken; `ensureGoogleReady` gates on `depsPresent`; `ensureGoogleapis` fails to the
honest delete-then-reinstall remedy for a present-but-broken tree on the auth path
(owner no-auto-repair); WP-103's doctor swaps its broken-vs-missing key
`isInstalled` → `depsPresent`. New tests a5/h/i/j + a doctor missing-main case;
a2/a3/a4 + containment probes stay green. `index.js` unchanged. WP-104/105 untouched.
