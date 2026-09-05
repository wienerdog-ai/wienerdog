# Lessons inbox (append-only)

One bullet per lesson, prefixed with WP id (or M0 for foundation work). The dream job consolidates; don't organize here.

- M0: GitHub user `wienerdog` is taken; org is `wienerdog-ai`, npm package `wienerdog` (free as of 2026-07-02 — reserve before public).
- M0: Both harnesses natively support SKILL.md folders (verified 2026-07) — canonical skill format needs no per-harness translation, only registration.
- M0: launchd StartCalendarInterval runs missed jobs on wake but NOT after power-off — hence the login-triggered catch-up check (docs/ARCHITECTURE.md).
- M0: macOS TCC — launchd-spawned processes don't inherit terminal permissions; unattended jobs must only touch non-TCC paths. Vault default `~/wienerdog` exists because of this.
- M0: "Every harness user has Node" is false — Claude Code's primary install is now a native binary via curl. Hence ADR-0006: curl bootstrapper as default entry point (guides Node install, never silent-installs).
- WP-001: `markdownlint-cli2` does NOT auto-read config from `package.json` like v1's `.markdownlint.json` — you must invoke it with `--config package.json --configPointer /markdownlint-cli2`, otherwise the inline config is silently ignored and defaults apply.
- WP-001: On Node v25.9.0, `node --test <directory>` throws `MODULE_NOT_FOUND` (it's treated as an entry-point script, not a test-runner target) — bare `node --test` (no path) relies on documented default recursive discovery and works everywhere, including the zero-test-files case (exits 0).
- WP-001: `npm install --save-dev` always regenerates `package-lock.json`, but it isn't in most WPs' Deliverables tables — don't commit it; `npm ci || npm i` in CI is the designed fallback for a lockfile-less repo.
- WP-001: actionlint (via `brew install actionlint`, which also installs shellcheck) flags unquoted word-split shell variables (SC2086) even in intentional multi-arg-expansion contexts (e.g. piping `git diff` output into a script's argv) — use `mapfile -t arr < <(cmd)` + `"${arr[@]}"` instead of a bare unquoted variable.
- WP-001 follow-up (review): lockfile policy set — package-lock.json is committed and always-allowed by boundary-check; memory/lessons/inbox.md likewise always-allowed (dogfood rule).
- M0-process: subagents given a repo path may cd to it instead of their isolated worktree — one reviewer ran git reset --hard in the shared checkout and destroyed uncommitted architect output (recovered from agent context). Rule: agent prompts must pin cwd to the worktree AND owner must commit main-checkout work immediately, never leave it uncommitted while agents run.
- WP-005 follow-up (review): shared config regex /^vault:\s*(.*)$/m in init.js+sync.js lets \s* cross newlines on a bare 'vault:' line — harmless for configs init writes, but change to [ \t]* when WP-006 touches sync.js.
- WP-005 follow-up (review): check-frontmatter covers specs+agents only — add a skill-frontmatter schema (name/description) for skills/**/SKILL.md in a future WP.
- WP-006 follow-up (re-review): forward normalization vs byte-round-trip are jointly unsatisfiable for files ending in 2+ blank lines — guarantee qualified in spec; realistic single-trailing-newline files round-trip byte-exact.
- Night-session process: REQUEST-CHANGES loop worked exactly as designed — reviewer proved defect, spec amended (spec was the bug), implementer fixed against amended contract, same reviewer re-verified. One full cycle: ~25 min.
- WP-002: in a `node:test` unit test that copies a script into a temp dir to test path-relative behavior (e.g. `path.join(__dirname, '..')`), invoke the *copied* script path, not the original — `execFileSync` with a different `cwd` does NOT change what `__dirname` resolves to inside the child process.
- WP-003: `fs.rmdirSync` refuses non-empty dirs, so uninstall needs the manifest file gone BEFORE rmdir-ing the core that contains it. Solution: `reverse()` deletes the manifest first (it's untracked bookkeeping) and seeds a virtual removed-set with its path so the core dir counts as empty in both dry-run and live runs — one code path, no ENOTEMPTY.
- WP-016: `node --test --test-name-pattern <str>` filters by *test title*, not filename — a test file whose `test()` calls don't literally contain the pattern string still reports as "passed" (0 matched subtests = vacuous pass). If a spec hands you a literal `--test-name-pattern` verification command, name your test titles to contain that substring, or the command silently verifies nothing.
- WP-004: `git init` run concurrently against the *same* directory can genuinely fail (`fatal: cannot copy '.../git-core/templates/info/exclude'`) — it's not just `git add`/index.lock contention, `git init` itself races on template copying. Reproduced reliably with two parallel `git init` calls on one dir. Wrap same-directory git bootstrap in a cross-process lock (mkdir-based, since mkdir is atomic) rather than assuming a single retry/recheck is enough.
- WP-004: when a later init step rewrites a file whose hash was already recorded in the install manifest (e.g. `config.yaml`'s `vault: null` placeholder becoming the real path), you must also update that manifest entry's stored hash — otherwise `uninstall`'s tamper-detection (hash mismatch = "user modified this, keep it") permanently refuses to remove a file Wienerdog itself changed, silently breaking uninstall.
- WP-004: pre-existing WP-003 tests (`tests/unit/init.test.js`, `tests/unit/uninstall.test.js`) don't override `WIENERDOG_VAULT` in their `tempEnv()` helpers, so once `init` unconditionally scaffolds a vault, every test-file process defaults to the *same* real `$HOME/wienerdog` — a correctness trap for any future WP touching `init`. Not fixed here (outside this WP's Deliverables table); flagged as a Discovered issue for a follow-up one-line patch.
- WP-007: the spec's REDACTIONS regex ordering isn't cosmetic — `sk-ant-…` must be tried before the generic `sk-…` pattern, because the generic pattern's alnum-only char class can't span the hyphen in `sk-ant-`, so with the wrong order it would silently fail to redact rather than double-redact. Worth spot-verifying each row of a secret-pattern table against real-shaped (synthetic/well-known-placeholder, e.g. AWS's own `AKIAIOSFODNN7EXAMPLE`) samples before trusting it.
- WP-005: `scripts/boundary-check.js` does *exact* path matching, but specs list directory deliverables with a trailing slash (e.g. `tests/fixtures/identity-filled/`, and WP-004's `templates/vault/`). Every file created under such a directory is flagged as "outside the Deliverables table" by the CI `boundary` job (`git diff --name-only` feeds it one file per line). Pre-existing gap affecting any WP with directory-style deliverables; boundary-check needs prefix/trailing-slash expansion. Not fixed here (not in this WP's Deliverables).
- WP-006: `sync` writes `<state>/digest.md` but never records it as a manifest entry (WP-005 behavior, inherited), so after a real `sync` the `state` and core dirs are non-empty and `uninstall` leaves them behind (rmdir refuses non-empty). Managed block / hooks / symlinks all reverse cleanly; only the regenerable digest.md lingers. Flagged as a Discovered issue — a one-line `recordOnce({kind:'file', path: digestPath})` in sync would close it, but it's arguably out of scope (digest.md is derived state, not user config).
- WP-006: the existing `manifest.test.js` "unknown kinds (forward compat)" case used `settings-entry` as its example unknown kind; once that kind became known, the test still passes only because the fixture path doesn't exist on disk (known kinds skip missing files). Landmine for future adapter kinds — pick a truly-never-implemented kind name for forward-compat fixtures.
- WP-008: `discover()` applies a single global `since`, so mirror the min-of-non-null-watermarks trick (null if either harness never dreamed) EXACTLY, then re-filter per harness with strict `> watermark` — otherwise a harness's already-processed files leak back in. Also: `paths` from WP-003's `getPaths` has no `vault` field (the spec's contract listed one that doesn't exist yet); harmless here because `readDreamConfig` reads `vault:` straight from config.yaml, but don't rely on `paths.vault`.
- WP-017: WIENERDOG_DREAM_CMD must be a single-token executable — spawnBrain uses shell-less spawn(command, []), so "node script.js" ENOENTs; ship dream-command fixtures with shebang + +x.
- WP-017: expectedScratch string[] can't detect content-mutation of an expected extract — added sha256 scratchBaseline; carry this forward in future dream WPs (latent WP-008 contract gap).
- WP-017: use git status --porcelain -z -uall so files in brand-new dirs are listed individually for frontmatter gating (default -u collapses to the dir).
- WP-017: the Bash tool runs zsh — no word-splitting of unquoted $VAR; pass multi-file arg lists via xargs/substitution when invoking boundary-check locally.
- Process: implementers no longer edit lessons inbox in-branch (parallel-merge conflicts); they report lessons in their final message and the session owner appends on main.
- WP-011: initial npm i may predate googleapis in package.json — tests asserting "no real googleapis loaded" must guard require.resolve in try/catch.
- WP-011: two-word dispatch keys (gmail search) vs group-word keys (auth/cal/drive) — router branches on group to avoid eating a positional as the verb.
- WP-012: check-frontmatter only validates specs+agents; skill frontmatter relies on each WP's structural test (recurring gap — candidate for a skills schema).
- WP-013: manifest reverse* helpers take boolean dryRun, not {dryRun} — mirror exactly when adding kinds.
- WP-013: platform-dispatch CLI tests need {skip} guards for cross-platform CI; pure generators carry the unconditional coverage.
- WP-014: structural tests grepping multi-word phrases must flatten whitespace first (markdown line-wrap breaks substrings); headings check raw.
- WP-014/021: gws gmail send resolves routine from WIENERDOG_JOB when --routine absent — what lets headless routines send under run-job.
- WP-015: node --test discovers by filename pattern only — plain scripts in tests/ never run; env-guard keeps quota safe.
- WP-015: local scenario runs need ANTHROPIC_API_KEY — OAuth/subscription login does not survive CLAUDE_CONFIG_DIR isolation (nightly CI unaffected).
- WP-020: don't override process.stdout.write inside node:test helpers — corrupts the reporter; tolerate noise.
- WP-020: process.kill(pid, 0): ESRCH = gone, EPERM = alive-but-not-ours — easy to invert.
- WP-020: watchdog-timeout tests are load-sensitive — give fake children ~2s headroom under full-suite parallelism.
- WP-021: dual-write (structured flags + duplicated positionals) is the resolution when a dispatch layer must serve both structured rows and positional-re-parsing bridges — but downstream rows must then prefer the structured flag (the gmail read --id bug).
- WP-021: monkeypatching a module export for tests is load-order-sensitive (destructured requires capture at first load); node --test's per-file processes keep it isolated.
- Review-loop stat: 12 implementation PRs this session — 11 first-pass APPROVEs, 1 REQUEST-CHANGES cycle (WP-006); reviews caught 2 real security gaps (Bearer redaction, consent wording), 1 latent CLI bug (gmail read --id), and the M3 real-brain sign-off passed live.
- WP-022: config values path.join'd under a trust boundary need allowlist validation at the read chokepoint, not per-consumer — a one-line vault_layout edit (identity_dir: ../../../etc) leaked out-of-vault file contents into the injected digest; WP-024/026 would have inherited it.
- WP-024: dream tier boundaries are layout-aware but the layout is read from config (outside the brain's write surface) BEFORE the brain spawns and passed by value — the brain cannot influence which paths get Tier-3 protection (temporal guarantee).
- WP-025: guided import mines the old vault read-only into the new one with origin: import; adoption (WP-026) is the in-place power-user path.
- WP-026: path.relative-based guards fail OPEN when their two inputs are in different symlink-resolution domains — realpath BOTH sides. macOS /tmp→/private/tmp makes this trivially testable; the TCC guard (born of the claude-os 4h hang) had this asymmetry.
- WP-026: when adding a regression test for a reviewer-reproduced bug, temporarily revert the fix and confirm the test fails — proves it covers the real failure mode.
- CLEANUP (next layout-touching WP): export isSafeRelativePath from src/core/layout.js and retire the attributed duplicate in src/core/layout-infer.js (drift risk).
- Session-2 review stats: 8 vault/subscription PRs — reviews caught 2 fail-open security holes (vault_layout traversal → digest exfiltration; TCC guard symlink-domain), both hardened with binding spec contracts before any downstream WP inherited them. Adversarial review mandates (traversal probes, symlinked-home) earned their cost.
- WP-027: init now defers vault creation — plain `init` leaves vault: null + a next-step; `init --fresh-vault` creates the default vault; the setup skill's fresh/import paths call it. Kills the phantom-vault-before-adopt rough edge.
- WP-027: a spec-supplied string with backticks placed inside a JS template literal SyntaxErrors at require time — escape them.
- WP-027: when deferring an install step, grep EVERY test that runs the command + a downstream command, not just the tests the spec's census names — codex-adapter's init→sync integration test was missed and the boundary CI job (not just the reviewer) blocks an out-of-table fix, forcing a spec amendment.
- WP-028: bootstrap deadlock closed — sync's skill+hook registration is vault-independent; init runs sync on the install path; the seam test (fresh machine → init → skill visible) now exists. Found by the maintainer's first real install — per-WP tests can't see seams; only fresh-machine e2e can.
- WP-028: sync that throws before staging anything on a missing precondition is a bootstrap-deadlock smell — split no-user-knowledge registration (always safe) from user-data steps (gated).
- WP-029/030: the dogfood loop closed for real — the maintainer's live adoption friction (logged in his vault per convention) became two specs, two PRs, two adversarial reviews, and merged fixes within hours. Surfaced-stderr-with-signal-hints, stale-lock healing, default vault .gitignore offer, no-HEAD self-healing snapshot, leading-H1 compaction.
- WP-029: mtime-based lock staleness (≥10s) can misjudge a live long-running git op — accepted architect tradeoff, on record via review; revisit only via wd-architect.
- Process: always run npm run lint before committing spec batches to main — the WP-029/030 spec commit broke main's lint (MD038) and two implementers had to diagnose around it.
- WP-031/032/033: consented dependency auto-install shipped (ADR-0011, T5b) — per-hop consent showing exact commands, /dev/tty gating, Node hard gate / git soft, signed-source preference, mandatory fail-to-print. Reviews byte-verified every display==exec pair and proved hermeticity under a real pty.
- WP-031 (review): consent_run's display/exec identity is convention not structure — downstream callers carry a binding byte-identity obligation; reviews must verify it per hop.
- WP-032/033: tests that reach a consent hop MUST inject WIENERDOG_TTY or interactive npm test can block on the real /dev/tty; success-path installs must drive ensure_* via the sourcing seam (resolve_bin's hardcoded dirs can leak the real node and exec the real npx).
- WP-033 (review): a spec's inline wiring note contradicted its own binding rule (short-form display vs long-form exec) — implementer correctly obeyed the rule over the note; spec fixed at archival. Rules > examples when they conflict, and say so in Decisions.
- Process (owner): stop verifying lint via `| tail -1` — the pipe masks the exit code; use `if npm run lint; then`. Broke main twice before learning this.
- WP-034/release: the first live public curl run caught a silent-failure bug no seam test saw (Node readline on piped stdin) — fixed, adversarially reviewed, and published as 0.2.1 within the session. Lesson: e2e through the REAL distribution channel (public raw URL + published npm package) is a distinct test layer nothing else substitutes for.
- Release: v0.2.0 tag exists but was never published to npm (superseded by 0.2.1 pre-publish) — public tags don't move; skip-and-supersede is the pattern.
- WP-035: Debian usr-merge (/bin → /usr/bin) silently defeats test PATH curation that includes either dir — symlink only named binaries into a fresh hermetic dir; keep a self-guard probe test asserting git/node unresolvable under it.
- WP-035: git identity failures can't be reproduced on a normal Mac (getpwuid fallback masks them) — use user.useConfigOnly=true to prove -c identity flags are load-bearing.
- Process (owner): 8 merges happened on reviewer-APPROVE while the ubuntu CI leg was red — reviewers verify on macOS, so matrix green is a distinct signal the MERGE step must check. Structural fix: branch protection requiring both legs, enabled once CI is green.
- WP-036/037: resolve_bin's hardcoded dir scans bypass PATH — tests driving ensure_* must override it to PATH-only (command -v); GitHub images ship real node at /usr/local/bin (ubuntu) and real git+node+npx at /opt/homebrew/bin (macOS).
- WP-037: exit 254 = npm's ENOENT spawn sh — in a "hermetic" test it means a real npx escaped and hit the live registry every CI run (supply-chain surface, not just flakiness).
- WP-037: bash command -v matches non-executable files; shims building shims must use builtins (printf) or hermetically-provided binaries — a failed `cat >file` redirection still creates the file.
- Process: fail-fast matrices hide later-listed-OS failures — the macOS leg had NEVER actually run green; fail-fast: false + branch protection requiring both legs is the structural fix.
- WP-038: launchd's clean env needs USER (Keychain auth) and ~/.local/bin in PATH (claude's native-install default) — an interactive-shell sign-off never exercises the scheduled-env path; the first real night does.
- WP-038: log rotation must whitelist by exact rotatable-name pattern, not lexically sort the log dir — the old sort deleted the newest daily logs (the incident evidence) while keeping stale ones.
- WP-040: a spec's example snippet contradicted its own acceptance criteria (missing bump-updated assertion) — reviewer caught it; criteria are binding over snippets, and the snippet gets fixed at archival.
- WP-039: dream lifecycle restructured per ADR-0012 — pre-commit of session edits after lock/before brain (frozen msg `vault: session edits before dream`) ends dirty-vault starvation; post-crash dirt is brain-authored by construction, so reset --hard + clean -fd (no -x, vault-scoped) ends self-starvation. Ordering IS the security property: pre-commit can never capture brain output.
- WP-039: the brain-run block needs catch (restore vault) nested inside the outer try/finally (release lock) — restore must complete before the lock releases so the next run sees a clean tree.
- WP-039 (review): gh is authenticated as the PR author, so `gh pr review --approve` self-rejects — reviewer verdicts land as PR comments; the effective gate is the reviewer verdict + branch-protection CI.
- WP-039 (review): with a WP branch checked out in a sibling worktree, reviewers must use a detached `git checkout origin/<branch>` — a named checkout errors.
- WP-041: durable alerts replace the transient digest banner — failLoud appends to state/alerts.jsonl unconditionally BEFORE best-effort email; same-job success clears; digest render groups per job (N durable lines → 1 digest line) so repeated overnight failures can't grow the digest unboundedly.
- WP-041 (review): alert `reason` carries only control-plane strings; raw brain stderr stays in logTail/email and never reaches the injected digest — keep that separation; routing stderr into `reason` would newly expose sessions to untrusted input.
- WP-041: swapping a transient surface for a durable one changes the TEST contract too — old tests asserting "email delivered ⇒ no other trace" become wrong and must be rewritten, not extended.
- WP-041: `--test-name-pattern` selects on test-name substrings — spec-mandated selector words must be baked into test titles or the spec's own verification command silently runs nothing.
- ADR-0013/0014/0015 chain (WP-042..047): vendored install (stable app/current + ~/.local/bin shim), dream scheduled by default at vault creation (silent + disclosed, ADR-0014), update checks (24h TTL, semver-validated, cache-rendered, never auto-update). Six PRs, every one adversarially reviewed; two spec-prescribed security defects caught pre-merge.
- Spec drafting: verify every Deliverables-table path resolves on disk before marking Ready — the phantom `src/scheduler/schedule.js` (real home: `src/cli/schedule.js`) recurred across THREE consecutive WPs and leaked into an inline require() snippet; boundary CI does exact-path matching, so a table typo blocks the real file. When a spec path is wrong, its embedded code snippets are wrong too — fix both in one pass.
- WP-042: `npm test` green does not prove hermeticity — a test that writes outside the temp core (the ~/.local/bin shim) passes silently while polluting the real home. Reviewers must inspect the real filesystem before/after a full suite run. Root cause pattern: overriding WIENERDOG_HOME but not HOME splits paths.core (temp) from paths.home (real). Isolation requirements must be behavior-invariants ("every test that invokes init/sync non-dry-run isolates HOME"), never closed lists.
- WP-043: `systemdUserDir()` prefers $XDG_CONFIG_HOME over $HOME — CI sets it to the real ~/.config, so scheduler tests must `delete process.env.XDG_CONFIG_HOME` at module scope or they leak real systemd units (surfaces only on Linux CI).
- WP-047 (security): a createRequire-from-private-dir seam is NOT an isolation boundary — Node walks every ancestor node_modules, so an empty deps dir silently resolved a planted ancestor googleapis (consent bypass + pin bypass + code exec under Google tokens; spec-prescribed pattern, caught by the reviewer's hijack probe). Fix: resolved-path containment guard with realpath-canonicalized boundary (require.resolve returns realpaths; naive startsWith false-negatives on macOS /var→/private/var). Prove such guards non-vacuously: first show the attack fires unguarded, and probe each resolution case in a fresh child process (CJS require cache falsifies in-process results).
- WP-047: `--ignore-scripts` on the consented googleapis install closes the lifecycle-script surface; display==exec byte-obligation includes the flag.
- WP-045/046: registry responses are untrusted input — strict semver shape-gate before storage (ASCII \d, non-m $ anchor, bounded length) is what keeps instruction-shaped text out of the injected digest; prove module hermeticity by re-running tests with https/net/dns monkey-patched to throw. Injectable seams that aren't self-bounding (opts.fetchLatest) are safe only while production never populates them — note where boundedness actually lives (defaultFetchLatest's 3s timeout) so a future WP doesn't make a hang reachable.
- Architect backlog from reviews: `ensureEntry` commits file+manifest before the OS reload, so a transiently failed reload is not retried by later syncs (reload-if-registration-missing candidate); wrapping adopt's vendor+schedule tail in a total degrade-to-notice guard would make "scheduling can never break vault adoption" absolute; cross-reference reconciliation (T7 vs Privacy posture) should be scoped into the WP that creates the contradiction.
- Reviewer craft: `ls dir && echo remain` false-positives on an empty-but-existing dir — use `find dir -type f` when asserting uninstall removal.
- Second silent-starvation incident (2026-07-05, WP-048): the dream exited 0 "nothing new" while 4 fresh sessions existed — every extract exceeded the 400KB total budget alone (per-extract caps allow ~8MB; two WPs' assumptions never reconciled) and the newest-first BREAK dropped everything behind the first oversized session. Fixes: budget default → 8MB (owner call, observe-then-tune); water-filling equal shares with truncate-to-share (newest messages kept, 32KB floor); kept===0-with-fresh-sessions now throws into failLoud/alerts.jsonl instead of lying "nothing new". Invariant to keep: an exit-0 path must never be reachable when input was discarded.
- WP-048 (review): budget/quota code must measure the SAME serialization it writes — compact-measure vs pretty-write under-enforces the budget by up to 1.54× (pre-existing; follow-up = write compact, WP-017 hashing is format-agnostic). Assert budgets by summing on-disk bytes in a test.
- WP-049/050: external Windows report (userreports/) → two same-day WPs. rename-over-existing-dir-symlink throws EPERM on Win32 (POSIX atomic-rename assumption); remove-then-rename fallback accepted under single-writer, ADR-0013 amended. Reviewer duty on any symlink-deleting fallback: prove empirically that rm on a dir symlink unlinks only the LINK (dev-mode current points at the live checkout — the nightmare target). Skills now copy where symlink is unpermitted (copied-skill manifest kind with recursive reverse — a plain dir entry would strand copies and break M7 reversibility).
- Windows posture: "officially deferred" does not excuse a hard crash in a published npx path — unconditional code paths must degrade, not stack-trace, on unsupported platforms.
- Parallel WPs racing on adjacent ROADMAP rows conflict at merge; recipe: rebase the PR's own commits onto main, union the status rows. Acceptable at current scale.
- Testability seams for platform-specific failures: inject the failing fs call (opts.rename / opts.symlink), never mock process.platform — CI has no Windows leg and platform lies rot.
- VPS cold-start transcript (2026-07-05, WP-051/052): the owner's real from-scratch Windows install surfaced friction no fixture test finds — full-journey transcripts are a distinct evidence class; read them line by line, they contain more WPs than the user's own bug report.
- WP-051: repointCurrent now no-ops when current already resolves to the target (zero link ops on routine same-version syncs) — this, not the EPERM fallback, is what defuses the Windows self-lock where the invoking node runs from inside app\current (the NORMAL shim/schedule path). Load-bearing invariant: vendorSelf always stores ABSOLUTE symlink targets; a relative readlink resolves against cwd and must repair, never false-positive no-op.
- WP-051: writeShim's win32 .cmd is an honest platform branch behind opts.platform (writer genuinely differs by host) — distinct from the forbidden process.platform test-mocking; record the rationale whenever a platform branch is introduced.
- WP-052: for agent-driven installs the human-in-chat IS the consent surface — the recommended prompt is dry-run (show plan, wait for go) → init --yes, with repo+npm links so a cautious driving agent can verify the package in one hop, and an explicit harness-restart step before /wienerdog-* commands exist. Docs-only WPs get reviewed by WALKING the text as the product surface, not byte-diffing.
- Harness fact worth remembering: "Git is required for local sessions" on Windows comes from Claude Code itself (Git Bash is its shell) — any Windows machine running Claude Code already has git, which reshapes the drop-the-git-dependency debate.
- ADR-0016 npm-less distribution chain (WP-053/054/055, 0.4.0): tarball fetch+sha512-verify+unpack core, `wienerdog update` verb, install.sh no-npm fallback. Registry tarball over plain HTTPS with mandatory sha512 SRI (no sha1 fallback — sha1 is broken); tarball URL constructed LOCALLY from the validated version, never read from the untrusted JSON; verify-before-unpack structural; path-traversal safety at extraction delegated to system tar's ../absolute refusals (documented in ADR-0016, verified on both CI OSes).
- WP-054: an update verb that hands off to sync MUST spawn the NEWLY-installed version's bin (app/<newV>/bin), never app/current (still old at handoff) nor the running module — otherwise the old version re-vendors itself and silently reverts the update with green tests. Reviewers trace the exact spawn-target path.
- WP-055 (security, 4th spec-prescribed defect caught pre-merge): a version/name string flowing into a filesystem path must be validated with a FULLY-ANCHORED (^...$) regex that rejects / and .. — start-anchored-only (`^[0-9]+\.[0-9]+\.[0-9]+`) accepts `1.2.3/../../x` and turns a verified download into arbitrary-write. Twin of the WP-022 traversal, different language. Bake "anchor both ends + reject /.. for any identifier→path, in every language" into the spec template. The Node path (isSemver, fully anchored) was already immune; only the bash regex had the hole.
- WP-055: when a checksum comes from the SAME untrusted document as the value it validates (manifest carries both version→dest and the SRI), the checksum gate does NOT defend against a hostile source — structural validation + the extraction sandbox are the real defense. State this at every such trust boundary.
- WP-055: end-anchoring a SHELL regex (`…$`) is necessary but not sufficient — grep -qE is line-oriented, so a multiline value with one good line still matches; the real question is whether the EXTRACTION step can inject a newline. Trace validator AND parser together.
- Round-2 gate discipline that pays: re-run the round-1 exploit against the new head (don't trust "fixed"), and prove a security test non-vacuous by reverting the fix and watching the guard fail. Both cheap; both catch placebo tests / incomplete fixes.
- Process: scheduler-runjob "hanging job hits the watchdog" test is flaky under full-suite parallelism (pid-file ENOENT race) — architect backlog item; not any WP's fault, reviewers/CI may see intermittent reds.
- Windows chain (WP-056..061, ADR-0017, v0.5.0): research-spike-first paid off — the two unguessable facts (irm|iex leaves a usable console, unlike curl|bash; Node's MSI is ALLUSERS=1 elevation-only, no per-user official install) shaped the whole design. When a platform assumption can't be verified from knowledge, spike before speccing.
- PowerShell engine facts now institutional: .NET regex `$` matches before a trailing newline — use \A...\z for untrusted-identifier anchors (^...$ is NOT a full anchor there); `exit` anywhere in an irm|iex-evaluated script kills the USER'S host window — return an [int] from Main and centralize exit at one dot-source disposition point keyed on $MyInvocation.InvocationName ('' = in-memory eval, must never exit); pure ASCII in installer scripts (BOM analyzer rule + PS 5.1 irm|iex decode hazard); locals must not shadow automatic vars ($home/$input/$args); PSScriptAnalyzer is stricter than spec-inlined PS — budget an analyzer pass.
- CI-unverifiable WPs (no Windows runner): split along the automatable boundary (pure helpers + analyzer in CI; real UAC/MSI/registry on an owner-manual checklist), write an explicit "coverage split" paragraph in the DoD, and gate the merge on the owner's real run — never claim coverage CI doesn't have. Move every mockable branch (SHA-mismatch abort, elevation-failure handling) INTO CI; leave only the genuinely physical (the UAC dialog itself) manual.
- A returning Pester test IS the no-exit proof — if the function called exit, the Pester host would die before the assertion. Host-fatal properties can be CI-proven on POSIX runners this way.
- WP-060: flipping a default on a shared prompt helper must be per-call opt-in (defaultYes default-false) so the dangerous caller (uninstall) stays byte-identical, and the default may only affect the interactive answered-Enter case — EOF/no-tty abort paths stay loud regardless. Review reduces to "prove the dangerous caller untouched + no-tty can't auto-proceed."
- display==exec breaks silently when non-interactive flags (winget --accept-*-agreements) are appended at exec but not shown at consent — derive the displayed string and the executed argv from one source.
- Owner-run field tests are the best QA layer we have: the VPS run validated WP-058 AND generated the next two UX WPs (vanishing window, default-N churn) in one pass; the 03:30 dream field-verified WP-048 by consolidating the exact four extracts the old code dropped.
- Process (owner, bitten twice — WP-050 ROADMAP race, WP-062 spec-archival race): NEVER archive a spec to done/ or edit its ROADMAP row while its PR is unmerged. The boundary workflow reads the spec path from the PR's ORIGINAL event payload and only matches docs/specs/WP-*.md (not done/), so a premature archival strands the PR un-mergeable-by-checks; reruns reuse the stale payload. Archival is strictly post-merge. If it happens anyway: the honest fix is --admin merge of the process artifact (after confirming the real diff is in-boundary and reviewer-approved), then reconcile.
- WP-062/063 (Windows scheduling foundation): win32 clean env sets BOTH HOME and USERPROFILE (child's paths.js keys off HOME first; cheap insurance against a first-scheduled-night incident); POSIX byte-identity for shared-file platform branches is proven by requiring main's and the branch's module side-by-side and deepEqual-ing outputs, not by reading diffs; Task Scheduler XML goldens stay deterministic only because StartBoundary is a fixed past date (load-bearing for content-hash idempotency); the validator-before-renderer invariant (windowsTaskName gates every name before XML embed) is pinned as a WP-064 acceptance criterion.
- WP-064 / v0.6.0 (gate waiver, owner decision on record): when the owner-manual verification environment is unavailable (admin-only VPS vs per-user scheduling), the honest path is ship-with-documented-waiver + named field tester through the PUBLIC install path — which doubles as a cold-start test. The waiver lives on the PR and in the spec's Done record; the deferred checklist items stay enumerated until field results land. Never silently drop a gate — convert it.
- Windows scheduling institutional facts (ADR-0018, verified): schtasks /create /it registers per-user with zero elevation at /rl LIMITED; StartWhenAvailable is XML-only (hence /create /xml, which also dodges /tr quoting); interactive-token tasks do not run while logged out (sleep vs logoff vs shutdown semantics differ — catch-up rides ONLOGON+hourly); Task Scheduler's battery defaults (DisallowStartIfOnBatteries=true) would silently skip laptop dreams — force false; no process groups on Windows → taskkill /PID /T /F pairs with detached:false, while POSIX pairs kill(-pid) with detached:true.
- Release cadence proof: five releases in three days (0.3.1→0.6.0), every one cut from a tag after the 0.3.1 drift near-miss, every WP adversarially reviewed, four spec-prescribed security defects caught pre-merge across the run. The pipeline holds at production speed.
- WP-067/068 (Windows uninstall field report → 5th spec-prescribed defect caught pre-merge, the most severe yet: DATA LOSS on the vault promise): a spec that declares a recursive delete "provably safe" on an invariant enforced in an out-of-scope file must be verified against that file's actual code — the cited adopt guard did not exist, and the sweep would have deleted an adopted-under-core vault while printing "your notes are yours." Fixes: containment guard IN the deleter (never trust upstream invariants when deleting; realpath BOTH sides + path.relative, never startsWith), adopt-side rejection closing the front door, and an honest summary variant when the guard fires — a false reassurance message is a bug of the same severity as the loss it narrates.
- WP-067: cmd.exe re-opens a batch file after each line — a shim deleted mid-run (uninstall through wienerdog.cmd) crashes the parent with "The batch file cannot be found." Fix: single parser block `@node "<bin>" %* & exit /b\r\n` — unconditional `&` (never `&&`, which skips exit /b exactly on node's failure path); bash shims are immune (exec replaces the shell). Test-pinning gotcha: endsWith('& exit /b') also matches '&& exit /b' — assert !includes('&&') explicitly.
- WP-068: fs.rmdirSync on a symlink-to-dir throws ENOTDIR though readdir/stat follow it — lstat first, unlink links, and make cosmetic final-cleanup best-effort so it can't fail the command. ADR-0019 now records the init-only-records-created-dirs invariant that keeps reverse()'s dir handler symlink-safe.
- Field-testing pattern confirmed again: an owner-requested "clean slate" uninstall surfaced three real bugs (one latent data-loss) that 529 green tests never touched. Every lifecycle verb needs a real-machine pass, not just the install path.
- 2026-07-07 dream incident → 3 WPs (069/070/071) + confirmed root cause. What actually happened: (1) the launchd dream/catchup agents were UNLOADED (plists intact, launchctl had no record) so 03:30 fired nothing AND raised no alert — the fail-loud path only triggers on a job that RUNS and fails, so a missing scheduler is invisible; (2) re-loading them fired the catch-up dream, and a simultaneous manual dream (my error) deleted the winner's scratch → aborted run that still advanced the watermark past 3 never-consolidated sessions.
- CONFIRMED root cause of the unload: tests (uninstall/codex-adapter/bootstrap-seam) ran init+uninstall under a temp HOME with no loader seam → real `launchctl bootout ai.wienerdog.dream`. launchd/systemd/schtasks identifiers are PER-USER-GLOBAL, not HOME-scoped — a temp-HOME test still hits the real scheduler. WP-071: every scheduler mutation routes through one `schedulerSpawn` chokepoint; suite-wide `WIENERDOG_TEST_NO_REAL_SCHEDULER` throws if a test tries a real mutation. reverseSchedulerEntry (uninstall unload) is a SEPARATE mutation path from the loader seam — easy to miss.
- WP-069: dream scratch is shared state; the lock must be acquired BEFORE any collect/write and the lock-loser must be a TOTAL no-op (never cleanScratch) — otherwise a second dream corrupts the winner's inputs. Watermark advances IFF the brain exited 0 AND every watermark-defining extract was byte-identical at brain-finish AND commit succeeded — a "brain exited 0" on vanished inputs must NOT advance (else silent session drop, the WP-048 blast pattern via a new cause). validateAndCommit's scratch scan is blind to total deletion (iterates existing files only), so the integrity gate lives in the orchestrator.
- WP-070: invisible-failure fix — doctor + injected digest surface "job configured but not loaded" via a read-only probe (launchctl print / systemctl is-active .timer / schtasks query), cache-then-render mirroring update-check (probe in sync/run-job → state cache → SessionStart renders cache-only). doctor probes LIVE (authoritative even when all-unloaded → no digest re-render). Remediation `wienerdog sync` had to gain reloadMissing because ensureEntry no-ops on identical content. Frozen user-facing copy carried a broken plural ("job s") — 6th spec-prescribed defect caught in review; a safety line that reads wrong is the WP-068 failure class.
- Operational: re-bootstrapping a real launchd agent is `launchctl bootstrap gui/<uid> <plist>`; verify with `launchctl print gui/<uid>/<label>` (exit 113 = not loaded). A transient GraphQL error on `gh pr merge` can leave the PR record OPEN while the squash actually landed on main — verify the merge commit + `git diff branch..main` before assuming failure; reconcile with `gh pr close --delete-branch` if the record is stuck.
- Cross-reference staleness (2nd occurrence, owner-spotted this time): WP-064 shipped Windows scheduled dreaming but the README's "isn't built for Windows yet" callout (added by the earlier docs PR) survived three releases. Rule for the architect: a WP that REMOVES a limitation must grep all user-facing files for every place that limitation was disclosed and scope those edits into its Deliverables — same class as the T7-vs-Privacy-posture contradiction (WP-046). Disclosures of limitations are liabilities that outlive the limitation.
- WP-072 (P1 Windows field bug): `irm .../install.ps1 | iex` hung on a Node-present machine because the handoff ran `npx --yes wienerdog@latest init` — `--yes` is npx's OWN pre-package flag, never forwarded to init, which then blocked on its interactive prompt (no /dev/tty on Windows; iex tangles the child's stdin so plan+prompt never surface). Fix: Main injects `--yes` into the init argv (idempotent) for both handoff branches; install.ps1's plan still prints for transparency. 2nd irm|iex handoff fragility after WP-061 (vanishing window) — TREAT "an interactive child prompt is unreliable under irm|iex" as a standing constraint: installer handoffs to init must be non-interactive (the installer is the consent surface). POSIX left interactive (works via /dev/tty). Flag-through-a-runner rule: the flag must go AFTER the target command, never before the package name.
- Backlog (architect): residual src/core/prompt.js confirm() can still hang on Windows for a NON-installer interactive `init` (stdin.isTTY true but the TTY delivers no line under iex). No safe non-heuristic guard (a timeout punishes a slow human). Only surfaces outside the now-`--yes` installer path.
- WP-073: `npm test -- --test-name-pattern vendor` does not actually scope `tests/run.js` — the full suite runs and prints regardless; future specs should not assume the pattern flag filters output, only that the named tests are included.
- WP-074: `Buffer.from(str, 'utf16le')` emits NO BOM — prepend `0xFF 0xFE` explicitly or schtasks mis-detects the encoding. Corollary: switching an on-disk file to UTF-16 silently breaks every test that reads it via `readFileSync(p, 'utf8').includes(...)` — those reads must become byte reads + `.slice(2).toString('utf16le')`.
- WP-074: the byte-wise `ensureEntry` compare (string|Buffer) is what lets `repointSchedules` converge win32 UTF-16 task files with no separate repoint fix — re-render and diff bytes, never string-diff mixed-encoding files.
- WP-075: adding a field to a struct return (`registerPlatform` gaining `loaded`) breaks every existing `deepEqual(res, {...})` full-object assertion, not just the tests for the new behavior — audit all of them when widening a return shape.
- WP-075: `schedule add` registers via real `process.platform` (no injected platform seam), so its failure-path test needs the `SCHED_SUPPORTED` guard — verified NOT dead in CI (true on darwin and systemd ubuntu runners). Functions that take an explicit `platform` arg test anywhere; seamless entry points don't.
- Field-report pattern (Peter, 2026-07-08, first external tester): asking the tester's AI to include a "Manual deviations present on this machine" section turned his workarounds (manual junction, hand-registered deviating task XML) into concrete update-safety requirements the specs could pin — request that section in every future field report.
- WP-076: the win32 clean job env (buildCleanEnv) is deterministic BY DESIGN — never pass the parent PATH through; instead the hardcoded list must cover EVERY binary Wienerdog itself spawns (node, claude, powershell, git). The POSIX list satisfied this by accident; the win32 list didn't (git missing → every dream ENOENT'd). When adding a spawn of a new binary, extend the clean PATH in the same WP.
- WP-076 diagnostic lesson (maintainer): the deterministic clean env made scheduled and interactive runs fail identically — which falsified the plausible "Task Scheduler stale environment snapshot" theory. The tester's cheap discriminator was a MANUAL run from a git-capable shell; prefer the cheapest falsifier over mechanism-guessing from timing correlation.
- WP-077: path.join on win32 yields backslash paths; Claude Code/Codex run command hooks through bash where unquoted `\` is an escape character (path collapses → ENOENT). Register hook command strings with forward slashes on every platform — valid for bash AND the Windows API; normalize at the single applySettings chokepoint, not per-adapter.
- WP-077: exact-string dedup appends a duplicate when the same path already exists with the other separator — converging already-installed machines needs an explicit prune of separator-variants of our own command before the presence check. Truth-table the four starting states (none / hand-fixed / stock-broken / unrelated user hook) in the spec.
- WP-078: verify Codex skill discovery in the STRUCTURAL section of `codex debug prompt-input` (`### Available skills`), not by grepping the whole prompt dump — the AGENTS.md digest chunk can contain the same names and produce a false positive either way. `debug prompt-input` is the zero-token ground truth for what a Codex session actually sees.
- WP-078: Codex skills are NOT slash commands — a Claude Code user typing `/wienerdog-setup` in Codex concludes the install is broken even when discovery works. `/skills` lists them; `$skill-name` or plain language invokes. Any harness with a different invocation surface needs its adapter to say so in a notice at install time (shipped in WP-078); check this for every future harness adapter.
- WP-078 (maintainer): the boundary CI job reads the spec path from the PR body and opens it in the PR's merge-ref checkout — a spec that exists only in the maintainer's working tree fails boundary with ENOENT. Commit the spec to main BEFORE the implementer opens the PR. Corollary: rerunning the failed job reuses the STALE merge ref from event time; after pushing the spec to main, refresh with `gh pr update-branch`, don't rerun.
- WP-078 (implementer, worktree isolation): the agent's Bash cwd silently defaulted to the SHARED checkout, not the assigned isolated worktree — its first `git checkout -b` switched the maintainer's checkout off main (dirty files survived, caught via `git worktree list`). Rule: `pwd` must equal the assigned worktree path before the first git mutation.
- WP-078: upstream "research facts" about third-party discovery paths need an expiry — WP-010's `~/.agents/skills` fact was OpenAI's documented direction but never shipped-verified; the shipped binary's strings (`strings` + grep) and `debug prompt-input` beat docs when they disagree. Re-verify on every Codex version bump (watch: legacy `~/.agents/skills` links double-listing if OpenAI flips discovery back).
- WP-079: `fs.existsSync(p)` follows symlinks, so it already encodes "dangling symlink ⇒ not registered" — no lstat/isSymbolicLink branch needed to distinguish valid link / dangling link / copied dir / absent when the question is only "does a working registration exist". Reviewer proved the four-state equivalence empirically; spec wordings that prescribe mechanism (lstat) rather than behavior invite unnecessary code.
- WP-079: test residual to remember — deleting a symlink tests the ABSENT state, not the DANGLING state (delete the TARGET to get dangling). The dangling path is verified out of band only; add a dangling-target case if doctor's skill check ever changes.
- WP-080: a spec that flags "verify live data shape before coding" deserves the check as literally the first step — `grep -rl '"name":"Skill"' ~/.claude/projects/` found real samples in seconds and confirmed `input.skill` + `tool_use_id` pairing outright; the alternative was a silently dead feature.
- WP-080: `is_error` is genuinely ABSENT (not false) on most real successful tool_results — design field-presence assumptions against real transcripts, not the two synthetic values spec authors imagine.
- WP-080 (spec bug caught at PR review): the spec's own pinned `rebaseInvocations` sketch carried a left-edge-only filter — the right-edge case (invocation as final raw event of an over-cap transcript) escaped with an out-of-range index. Pinned code sketches must be boundary-checked by BOTH architect and implementer; seven design-review rounds on prose logic did not catch a code-sketch off-by-one that one PR-review pass on real code did.
- WP-080 (review disposition): when a review fix touches a helper whose signature/tests the spec pins verbatim, fix at the CALL SITE — contract stays byte-verifiable, bug still closed.
- WP-083: `typeof [] === 'object'` — every "must be an object" config/registry guard needs explicit Array.isArray + null checks; a malformed-input test caught it pre-ship.
- WP-081: layered validators (schema before append-only) legitimately pre-empt each other's tests — verify each security layer has at least one NON-VACUOUS test where that layer itself produces the revert, and document which tests are belt-and-suspenders.
- WP-082: a spec pinning BOTH code and its test can be internally inconsistent (reason-string substring, prose wrap breaking a literal-space regex) — reconcile by keeping the acceptance-gate TEST verbatim and adjusting the freeform side, recorded under Decisions.
- WP-082: later WPs whose test sketches re-declare `const` helpers already merged by dependency WPs hit SyntaxErrors — sketches written before dependencies merge should mark helpers as "reuse if present".
- WP-082 (canary runner spec bug): the spec's EXPENSIVE canary used `init --yes` (vault never registered in config → dream aborts at the git-repo gate → VACUOUS PASS, the injection test never ran) and planted the poison transcript in the REAL ~/.claude/projects (tonight's real dream would consume it). Correct wiring is the scenario harness's: `init --fresh-vault --yes` + WIENERDOG_CLAUDE_DIR override; PASS must additionally require dream rc 0 + report exists + the attempt recorded under "Gated out" — body-unchanged alone cannot distinguish "gated" from "never ran".
- Pipeline (maintainer): the Codex adversarial loop (docs/runbooks/codex-review.md) took ADR-0020 through 7 design rounds / 16 findings, then PR reviews caught 1 more real P1 — design review and PR review catch DISJOINT bug classes; both gates are load-bearing. Codex citation accuracy across the run: zero hallucinated references; one finding (round-6 re-review P2) was correctly rejected against spec text — the loop needs an owner-side disposition step, not blind application.
- Pipeline (maintainer): implementer/reviewer agents in worktree isolation switched the SHARED checkout's branch twice via cd-based git calls before prompts mandated `git branch -m` + worktree-only git; check `git branch --show-current` on the shared checkout after any agent wave.
- WP-102: `resolvable` state must be captured BETWEEN the resolve and the require — both failure modes land in the same catch, so absent-vs-broken can't be inferred after the fact without a second resolve.
- WP-102 (guard rewrite): Node's `Module._pathCache` caches successful bare-request resolutions keyed by request+lookup-paths — a containment guard that resolves-then-rejects an ancestor copy poisons the same-process retry after a fix-up install. Direct-path candidate construction (existence-gate + absolute resolve + realpath check) is cache-immune and strictly stronger containment.
- WP-102: `npm install <pkg>` over a corrupt-but-metadata-intact tree can no-op ("up to date") — arborist diffs recorded version/integrity, not installed file contents. A user-facing repair remedy must prescribe delete-then-reinstall, never bare reinstall.
- WP-102: a prompt advertising `[Y/n]` must actually pass `{defaultYes: true}` — prompt.js defaults empty-answer to false; the WP-047 install consent had silently declined on Enter since it shipped.
- WP-102/103: every user-facing command string interpolating a path needs the path quoted (`--prefix "${dir}"` — double quotes work in POSIX sh, cmd, and PowerShell); Windows home dirs contain spaces.
- WP-102: interactive helpers called on JSON-output code paths must write ALL chatter (notices, prompts, child stdio) to stderr — `--json | jq` breaks on a single stray stdout byte.
- Pipeline (maintainer): stacked-PR ROADMAP status flips on ADJACENT table rows can never merge cleanly (git conflicts on adjacent-line changes) — flip all rows once on the specs branch and byte-align every WP branch's copy so no WP branch diffs the file at all.
- Pipeline (maintainer): squash-merging a stacked PR chain destroys the shared merge base and conflicts at every step — use merge commits for stacks (proven by simulation before merging #103→#105→#104→#106); run `gh pr update-branch` after each merge so the boundary CI re-computes against the new main.
- Pipeline (maintainer): spec docs branches must pass `npm run lint` BEFORE implementers merge them — three markdownlint escapes (MD038 escaped-backtick code spans, MD004 wrapped lines starting with `+ `) each broke every downstream WP branch in one session.
- Pipeline (maintainer): when a stacked WP's test proves behavior owned by the sibling branch's module, a behavioral-probe self-skip (plant fixture → observe accept/reject → skip with reason) makes the test self-arming across any merge order.
- Pipeline (maintainer): Codex focus text containing backticks gets command-substituted by zsh — write the prompt to a file and pass `"$(cat file)"`.
- WP-104: spec with copy-paste-ready "Exact contracts" (helper body, switch-case body, literal test assertions all inlined verbatim) needed zero back-and-forth — for size-S WPs this spec shape is the ideal; wd-reviewer could byte-match the diff against the contract.
- WP-104: escaping order (`\` before `'`) is easy to reverse when writing from memory — implement query-string escaping from the spec's literal regex chain, never reconstructed.
- Pipeline (maintainer): a spec that pins exact test cases can still leave a mutation-coverage hole — WP-104's pinned tests covered quote-escaping but no input contained a backslash, so deleting the backslash replace would have passed green; Codex's adversarial "would the tests catch a wrong implementation?" lens caught what spec-conformance review structurally cannot.
- Incident (maintainer, 2026-07-12→16): a half-sandboxed demo run (`WIENERDOG_HOME` → mktemp, real `~/.claude`) repointed the live skill symlinks and added temp-path session hooks; macOS's ~3-day temp purge then turned it into "Unknown command: /wienerdog-setup" and a failing dream job while `doctor` stayed all-green. Root-caused by diffing the install manifest (said symlink → `~/.wienerdog`) against disk (symlink → `/var/folders/...`). WP-106/107/108 close the three gaps: doctor link-target validation, stale-hook notice, half-sandbox warning.
- Pipeline (maintainer): RECURRENCE — the existing "spec docs must pass `npm run lint` before implementers branch" lesson was not applied and the same MD038 escaped-backtick class (plus an MD056 table pipe) shipped to main again with the WP-107/108 specs, breaking lint for both implementer branches. An inbox lesson that recurs needs to graduate to mechanism: lint-gate every docs(specs) push to main.
- Pipeline (maintainer): WP-108's design loop ran 11 Codex rounds; convergence needed three explicit steers — adopt the reviewer's replacement language near-verbatim (paraphrase drift cost two extra rounds), state invariants in closed form (the snapshot-∩-isDir upper bound) so later rounds verify one property instead of an enumerable case list, and authorize "inherent micro-races accurately dispositioned are settled" so an adversarial reviewer can terminate instead of generating race findings forever.
- Pipeline (maintainer): a Codex plugin invocation from INSIDE a subagent died silently (no process, no output file, no completion signal — the orchestrator saw only a stalled transcript); orchestrator-run `codex-companion.mjs adversarial-review/review --background` then succeeded 14/14 times. Keep Codex calls in the orchestrator session, and treat a subagent's "review running in background" claim as unverified until output exists.
- Pipeline (maintainer): wd-architect's self-review fallback (used when the plugin died) fixed 5 real defects, yet the first genuine Codex round found 5 MORE it had missed — reviewer independence is load-bearing, not ceremonial. Treat the runbook's plugin-unavailable fallback as provisional and require a real Codex pass before implementation.
- WP-106/107/108: all three implementers reported zero design decisions needed — the adversarially-hardened inline contract code in the specs made implementation copy-adapt, and wd-reviewer could byte-match diffs against the contracts. The 11-round design cost was repaid downstream; for subtle logic (path aliasing), literal code blocks beat prose descriptions decisively.
- WP-106: an implementer agent's cwd can default to the shared checkout instead of its assigned isolated worktree — `git checkout -b` there trips the harness worktree guard mid-edit. Always verify `pwd` matches the assigned worktree before branching or editing.
- WP-108: `node --test --test-name-pattern` silently unselects tests whose names lack the pattern substring — prefix new test names with the module name so the documented filter command actually runs them.
- WP-109: `npm test -- --test-name-pattern X` still prints every test *file*'s summary line even when a file contributed 0 matched tests — don't mistake that for the pattern being ignored; grep the individual `✔ <module>: ...` lines to confirm what actually ran (complements the WP-108 naming lesson).
- WP-109: `tests/unit/sandbox-guard.test.js` is the ready-made template for subprocess CLI tests (`execFileSync(process.execPath, [bin, ...])` + try/catch status capture) — point future CLI-preflight WPs at it instead of re-deriving the pattern.
- WP-109: keeping a security module structurally incapable of reading `process.env`/`process.argv` (pure function of a frozen constant + explicit argument) made the "no override" acceptance criterion trivially provable — one test flips WIENERDOG_YES/--yes around the calls and asserts nothing changes.
- Pipeline (maintainer, 2026-07-17): RECURRENCE of the "spec docs must pass lint before landing" lesson — the 2026-07-15 audit-package import carried two MD038 violations to main unnoticed because the local checkout had no node_modules, so the markdownlint layer of `npm run lint` had never actually executed locally (`npx --no-install` exits nonzero). Run `npm install` before trusting a local lint pass on a fresh clone.
- WP-110: gating a dispatch chokepoint with a single `requireCapability` immediately after handler resolution (before parseFlags/getPaths/ensureGoogleReady/getServices) is a clean blunt-freeze pattern — no per-verb branching, no missable path, and the `opts.profile` seam composes without touching env/argv.
- WP-111: before threading a new parameter through a call chain, grep the existing call sites first — `runJob` already called `resolveCommand(paths, job)` two-arg, so "production stays frozen" required zero changes there, only a JSDoc note.
- WP-112: a golden-file-based behavior freeze can miss non-golden tests asserting the same behavior through different fixtures (here `layout.test.js` power-user + `adopt-e2e.test.js`); grep the whole tree for the frozen behavior before scoping a Deliverables table. The implementer correctly stopped at the boundary and reported it; the owner amended the spec mid-flight and the same agent finished — the boundary + amendment flow worked as designed.
- Pipeline (maintainer, 2026-07-17): parallel WP implementers in isolated worktrees all started from a branch point predating their dependency's merge (WP-109 code missing, own spec still Draft) — all three independently diagnosed and fast-forwarded/rebased onto main. When spawning parallel worktree implementers, state the expected base commit in the brief, or create the worktrees after the dependency lands.
- For A3 (maintainer, from wd-reviewer on WP-112): `isInjectedIdentity` is case-sensitive by contract, but on a case-insensitive filesystem (macOS APFS default) a dream add of `06-Identity/Profile.md` would route to the Tier-3 floor while the digest's literal `profile.md` read resolves to the same inode — a floor-passing case-variant could theoretically reach injection. Spec-design limitation, not implementer error; fold a case-folding path-identity check into the A3 exact-byte trust registry WP.
- WP-113: giving a docs-only implementer literal target prose in the spec's Exact contracts (not just bullet requirements) removed all wording/tone ambiguity — the T0 section pasted near-verbatim; reuse this for the A2-A6 documentation WPs.
- WP-113: the reviewer's accuracy pass (every doc claim traced to a file:line in the landed code) is the step that makes "claims mechanically traceable to a gate" real — keep it a mandatory review dimension for security-facing docs.
- WP-114/115 (spec review): the per-ticket owner walkthrough before implementation caught a real divergence a "zero behavior change" dedup spec had missed — the shared parser and the old validator disagreed on the no-separator-space `key:value` form; surfacing lexer-level diffs is spec-review work, not implementation-time archaeology.
- WP-114: the strictness decision (malformed block → exclude unconditionally) only became decidable after establishing the WRITE lifecycle of the gated files (post-WP-112 they are human-authored only) — answer "who can write these bytes?" before choosing lenient-vs-strict on the read side.
- WP-114: JS regex `.` does not match `\r` — a CRLF field line silently lexes as a junk/malformed line; strip one trailing `\r` at the line level before matching, and lock the CRLF forms into the differential corpus.
- WP-114 (residual): a fully-CRLF vault note (`---\r` delimiters) is invisible to BOTH parsers → trusted-by-default renders; inherited pre-A4 behavior, candidate for the deferred `wienerdog doctor` vault-frontmatter check.
- WP-115: run a spec's grep-based acceptance gate AT SPEC-WRITING TIME — the "one lexer" grep found two parser copies (layout.js cleanValue, validate.js skillBody) the spec's Current state never knew about, making the checklist unsatisfiable as scoped until an amendment.
- WP-115: when unifying N divergent implementations onto one, "zero behavior change" is unsatisfiable if they ever disagreed (here: quote-first vs comment-first coercion order) — find the disagreement, pick one order as an owner decision, and never paper it over with an unverified "unobservable" claim (the reviewer disproved exactly such a claim).
- WP-115 (git): `git mv` stages the rename with the INDEX blob — if the file was edited before the move, the edit stays unstaged and silently drops out of the commit; always `git add` the new path after a pre-move edit.
- WP-116: deliverables test-inventories built by grepping direct importers miss integration tests that reach the changed function THROUGH the CLI — inventory transitive callers too (the dream e2e broke correctly and needed a spec amendment to be fixable).
- WP-116/117 (pattern, twice this session): with fail-closed changes, an old green test breaking is often the first real proof the new gate works (dream digest losing identity; the prototype-key probe) — before "fixing" the test, decide which behavior is the wanted one.
- WP-117 (security, reviewer-caught): plain-object allowlists leak — `KNOWN[arg]` resolves inherited prototype members (`toString`, `constructor`, …) past the guard to a filesystem read; decide allowlist membership with `Object.prototype.hasOwnProperty.call` (or `Object.create(null)`), and regression-test the prototype-key names.
- WP-117 (spec drafting): "reuse the same read sync.js uses" pointed at an un-exported helper in an out-of-boundary file — when a spec references an existing helper, verify it is exported AND its file is inside the deliverables (or name the shared alternative); the implementer resolved it via the WP-115 shared readScalar and the spec was amended to match.
- Follow-up (tracked in ROADMAP, from WP-117 review): unify sync.js's private readVaultPath onto the shared readScalar — the ratifier and the digest gate currently resolve the vault via different readers; divergence is fail-closed only, but one reader is the honest end state.
- WP-118: `Buffer.indexOf` on a reused read buffer can match stale bytes beyond `bytesRead` — clamp the newline search to the current read's valid region or phantom line splits appear.
- WP-118: proving "file never opened" needs no fs spy — pass a nonexistent path with an over-ceiling size; any open attempt surfaces as `read-error` instead of `over-ceiling`.
- WP-118: the constrained-heap OOM proof is cheap as a `spawnSync` child with `--max-old-space-size` and an inline `-e` script via `require.resolve` — no fixture bloat, ~1s runtime; the pattern extended cleanly to WP-119's whole-pipeline memory proof.
- WP-118: when a spec's return-contract omits a field its own semantics require downstream (`runExhausted` vs capacity-deferral), propagating it verbatim from the inner result + recording the decision beats silently dropping signal — review confirmed it as spec under-specification and the contract was amended.
- WP-118: converting a `for` loop body into an `onLine` callback silently breaks `continue` statements — they must become `return`; grep the moved body for `continue` before trusting green tests.
- WP-118: clamping reads to a shared budget means a binding budget always lands exactly on 0 — gate exhaustion on `bytesConsumed < sizeBytes`, not `remaining <= 0` alone, or fully-read files get falsely deferred and a trailing no-newline line is silently dropped.
- WP-118 (residual, on record): a stale-HIGH discovery size plus a budget binding at the real (shorter) EOF still over-reports `runExhausted` — inherent to using sizeBytes as the EOF oracle; self-healing via next-run retry, documented in the review close.
- WP-119: raw file size does NOT always over-estimate the serialized extract (the envelope can exceed a tiny transcript) — grant enforcement must distinguish whole-file grants from share grants or tiny sessions get spuriously truncated.
- WP-119: `fs.truncateSync` sparse files make 50 MB+ over-ceiling fixtures free on APFS, and chmod-000 on them proves "never opened".
- WP-119: distinguishing "fresh empty ledger" from "persisted ledger with a null baseline" for one-time migration is cleanest by re-checking the on-disk file for the baseline key, not by flagging the in-memory object.
- WP-119 (security, reviewer-caught): "same rule as `formatAlerts`" analogies need a provenance check — formatAlerts inputs are code-owned, a basename is attacker-influenceable; a hostile filename (newline + markdown) injected its own line into the digest banner. Any string crossing into an injected surface needs a whitelist at the crossing point, not an analogy.
- WP-119: when the same untrusted-derived string reaches two surfaces (digest + console), export ONE shared sanitizer — the case divergence between the two call sites was itself a review finding.
- WP-119: hostile-filename integration tests work with real on-disk files (macOS allows `\n` and markdown chars in names) — driving the actual discover→quarantine→banner path beats simulating the ledger record.
- WP-119: audit every state write on the `--dry-run` path explicitly — a "record even on idle runs" requirement silently smuggles persistence into preview mode unless the spec carves it out; TWO such writes were found (quarantine record, then the migration write).
- WP-119 (review craft): a guard test must run from the state the guard exists for — the fresh-state dry-run test never fired the migration branch, so the persist bug passed green; enumerate the branches feeding a guarded block and cover the one real users actually enter (here: the upgrade path).
- WP-119 (process): when an owner ruling names an artifact ("must not mutate transcript-ledger.json"), apply it to every write path touching that artifact — classifying one write as "idempotent normalization, not really that kind of change" is exactly how rulings get silently narrowed; the reviewer correctly escalated instead of accepting the implementer's carve-out.
- WP-120: reserving the protected prefix's line/byte footprint BEFORE budgeting the capped body is the clean way to satisfy a hard "never drop the prefix" invariant — call it out explicitly in future protected-prefix + capped-body specs.
- WP-120: to unit-test a byte cap in isolation, put the payload in a single line — many short lines exercise the line cap first and mask the byte-cap path.
- WP-121: the spec's directory-as-digest TOCTOU trick never exercises the node try/catch (`[ -f ]` short-circuits) — a chmod-000 file (with a root-detection probe) is the case that actually goes RED under `set -e`.
- WP-121: when testing "node missing from PATH", spawn bash by absolute path resolved once with the real PATH — so the manipulated child PATH only affects `command -v node`, not finding bash itself.
- WP-121: `mkdir -p` on an existing-but-unwritable dir exits 0 — the unwritable-state failure surfaces in `appendFileSync`, so the node-side try/catch is the load-bearing guard there.
- WP-121: root ignores file modes — every chmod-based adverse test needs a probe read/write to skip or relax gracefully.
- A6 pipeline (maintainer): an ADR's status string gets quoted in prose (ROADMAP narrative blocks) — grep for the status text when flipping Proposed→Accepted or the copies go stale.
- A6 pipeline (maintainer): a background reviewer that dies mid-run on a transient API error resumes cleanly from its own transcript with full context — resume the same agent rather than respawning, so probe state and prior findings carry over.
- WP-122: keeping the legacy redaction pipeline first (verbatim order) and adding all new coverage as rules after it made the detector upgrade byte-compatible by construction — goldens proved it without edits.
- WP-122: overriding RegExp.prototype[Symbol.replace] in a try/finally is a clean test seam for proving a fail-closed catch path without adding any API surface.
- WP-123: git classifies a file binary on a NUL in the first ~8 KB (attacker-influenceable) and then emits no diff lines — any staged-diff-line scanner needs an explicit binary fail-closed branch (numstat `-` counts is git's own signal).
- WP-123/WP-125: the same contract-vs-acceptance severity contradiction appeared at both no-rewrite gates; the general rule the owner ratified — a gate that may not rewrite withholds on ANY finding — should be stated once in the ADR next time, not rediscovered per WP.
- WP-124: when a stream chunk is consumed by two sinks (tail + log tee), redact once and reuse — and document the chunk-boundary limitation at the tee site, not just in the spec.
- WP-125: shrinking an old test's fixture (1M→100K chars) to stay inside a new bound is legitimate when the test's PURPOSE (digest-wide byte cap) is preserved and the new bound gets its own dedicated test.
- WP-126: Dirent.isFile() filtering makes a chmod sweep symlink-safe (chmodSync follows symlinks — a planted symlink would otherwise let the repair pass chmod files outside the set).
- WP-126: when two spec contracts conflict on ordering (repair "after the digest write" vs "post-repair count in the digest"), pick the ordering that makes both surfaces truthful and record it — the reviewer ratified repair-before-render.
- WP-127: a docs WP that depends on several just-shipped code WPs must verify every claim against the current ADR/code, not the spec's own draft prose — two owner rulings postdated the spec text ("hard finding" was stale), and the reviewer caught two more claim-to-code slips (hasHardFinding consumers, doctor's quarantine check).
- A5 pipeline (maintainer): ROADMAP status cells drift from spec frontmatter (Ready/In-Review are not mirrored by convention, but one agent synced In-Review anyway) — nothing enforces agreement; worth a lint later.
- A1 spec phase (maintainer): runtime-uncertain spec assumptions must be settled by a live `claude -p` spike BEFORE locking the decision — spikes caught two real spec bugs pre-implementation (empty `--tools` exposes ALL built-ins, not zero; a probe prompt's echoed `BASH-OK` string is a false-fail trap). Decide from measurement, not from how the flag "should" behave.
- A1 spec phase (maintainer): `claude -p --output-format json` exposes a structured `permission_denials` array (tool_name + tool_input path per denied call) — a far more stable anti-false-pass signal than parsing a free-text tool inventory; prefer it for any containment self-check.
- A1 spec phase (maintainer): a tool-execution check must key on ground-truth side effects (canary token absent from output, out-of-staging file absent) + `permission_denials`, NEVER a magic string in the model's output — the model echoes instruction strings (e.g. "BASH-OK") in its report though the tool never ran.
- A1 spec phase (maintainer): `--setting-sources ""` (empty) is accepted by Claude Code 2.1.21x and genuinely excludes the user source (a planted user SessionStart hook did not fire); `disableAllHooks` in `--settings` independently suppresses user hooks too — the ADR's exclude-source + belt-and-suspenders both hold.
- A1 spec phase (maintainer): a user/project/local `disableAllHooks` canNOT disable a managed/admin-policy hook (official docs; inverse bypass bug fixed in 2.1.49) — but a managed hook is the admin's deliberate config, not attacker-reachable, so it is trusted-computing-base (A12/A7 shelf): WARN + record + proceed, NOT a hard STOP that would brick the dream on every managed machine.
- A1 spec phase (maintainer): for a fast-auto-updating dependency (Claude Code shipped 2.1.212→2.1.214 in a day), a repo-pinned "supported version" constant is the wrong production safety mechanism — it goes stale instantly and drift-warns constantly; verify the ACTUAL local runtime behavior before each run (fail-closed) instead.
- A1 spec phase (maintainer): don't calibrate a security proof to the current frozen state — "the feature is blocked now" is a circular reason to under-test, because the proof IS the precondition for unblocking. Calibrate the proof to what opening the gate demands; defer only for a non-circular reason (the thing being proven doesn't exist in final form yet — e.g. the A2 broker path).
- A1 spec phase (maintainer): a docs/reconciliation WP that depends on many just-resolved decisions must be re-checked against the FINAL decisions before Ready — WP-134 predated the managed-STOP→WARN reversal and the WP-135 runtime-self-check, so its content requirements were stale and would have mislead the implementer.
- A2 spec phase (maintainer): Claude Code actively SIGINTs its MCP stdio children on graceful shutdown, but a SIGKILLed parent delivers NO signal — the child is reparented to PID 1 and dies only if it exits on stdin EOF; any hand-rolled MCP server must treat exit-on-EOF as the load-bearing orphan guard, not politeness.
- A2 spec phase (maintainer): measured MCP stdio framing is newline-delimited JSON-RPC with multiple messages arriving in one read chunk, and echoing the client's requested protocolVersion back in initialize is accepted — pin protocol goldens from recorded live frames, and tolerate unknown extras like tools/call `_meta`.
- A2 spec phase (maintainer): an advertised-but-unallowlisted MCP tool is denied CLIENT-side under `--permission-mode default` — the server's own log proves the call never crosses the MCP boundary — so an exact `--allowedTools` list is a real pre-boundary that a probe server can assert headlessly.
- A2 spec phase (maintainer): google-auth-library has NO default for `include_granted_scopes` (omitted ⇒ the param is absent from the auth URL and Google's server-side default governs) — always pass `false` explicitly; and detect expired refresh tokens on `e.response.data.error === 'invalid_grant'`, never `e.message`, which the library rewrites in its ReAuth branch.
- A2 spec phase (maintainer): one throwaway env-parameterized probe MCP server (configurable tool names, call delays, PID/env/lifecycle logging) resolved seven SPIKEs across three WPs — build the measurement harness once, reuse it per question.
- WP-146: the foreign-symlink preserve deliberately ends sync's silent auto-repair of a stale wienerdog-* link (the 2026-07-12 half-sandbox class) — doctor still detects (WP-106) but its remediation text ("run 'wienerdog sync' to re-link them") is now inaccurate for this case; needs a follow-up docs/doctor WP.
- WP-149: spec-scoping gap caught by review — the acceptance criteria asserted adopt-LEVEL behaviors (home refusal, --yes refusal) but the Deliverables test row only asked for inspectAdoptTree unit coverage; resolved in-boundary since the listed test file already hosted adopt.run() cases. Lesson: give every acceptance criterion an explicit test home in the Deliverables table.
- WP-151 (not started): the owner-walkthrough paragraph can carry cross-batch sequencing constraints beyond depends_on (here: "sequence WP-151 after WP-141 lands") — always read the walkthrough paragraph before picking up a Ready spec.
- A13 batch (Gyula side): implementing against a Draft spec, then diffing Draft→Ready before shipping, worked — WP-150's walkthrough amendments were record-only, so the reviewer-approved implementation survived verbatim. Verify contract-identity, don't assume it.
- WP-146 (Codex adversarial review, Gyula side): DISCOVERED ISSUE needing a new WP + owner walkthrough — applySettings prunes only alternate ENCODINGS of the current command, not a superseded command for the same event. When a hook command's script path changes between syncs (e.g. WIENERDOG_HOME relocation — the 07-12 incident class — or a renamed hook script), the old command A stays live in the settings file; WP-146's manifest upsert now records only [B], so uninstall strips B and orphans A permanently. Correct fix changes applySettings' pruning contract to also remove the PREVIOUS recorded command set (available from the pre-upsert manifest entry) — a design change beyond WP-146's "upsert the manifest" scope, so deferred rather than silently expanded. Coordinates with Felho's hook-hygiene work (WP-107/incident).
- Process (Gyula side, 2026-07-18): the A13 batch shipped through wd-reviewer only; the Codex adversarial leg of the standing double-gate was initially SKIPPED. Retro Codex pass then caught 2 high + 1 medium (2 ownership-transition bugs invisible to fresh-manifest tests + an unbounded readdir in a "hard-bounded" walk). Lesson reaffirmed: wd-reviewer + Codex are not redundant — independence catches ownership/round-trip transitions that spec-shaped unit tests structurally miss. Never mark a security-facing WP done on a single reviewer.
- WP-146 F1 (Codex confirmation review, Gyula side): the dropOwnedEntry fix only closes the RE-SYNC-then-uninstall path. The COMPLETE fix is now specced as **WP-153 (Draft)**: reverseSymlink (manifest.js) unlinks any symlink at a recorded path with NO target check, so a direct uninstall (no healing re-sync), or a sync that fails before the mutated manifest is saved, still deletes a user's replacement link. Fix = record the expected symlink target in the manifest entry and unlink only when the current target still matches (mirror reverseCopiedSkill's lstat+hash ownership proof). CORRECTION (3rd Codex pass): do NOT claim WP-144/145 cover this — WP-144 is scoped to NOT change existing ownership proofs and defines the symlink entry as {path} only; WP-145 is scheduler-only. A vague "route to A8" is not actionable — the repo requires a spec-backed WP, hence WP-153 (depends_on WP-144 for schema coordination; needs an owner walkthrough before Ready). Lesson: never defer to a work package without reading it to confirm it actually covers the item.
- WP-149 F3 (Codex confirmation review, Gyula side): a first "streaming" fix for the unbounded-readdir finding introduced a WORSE bug — a recursive opendir walk holds one directory handle per depth level (EMFILE on deep trees) AND its opendir catch silently skipped the subtree without marking the scan incomplete, so a secret below the failure depth returned clean and --yes proceeded: a fail-OPEN in a security guard. Lesson: (1) when replacing an unbounded read with streaming, bound HANDLES too (iterate an explicit path stack, one handle at a time, close before descending); (2) in a security guard, ANY scan incompleteness (unreadable dir, read fault, hit cap) must fail CLOSED, never silently return "clean". Codex reproduced the fail-open with a 3-handle limit; the first fix's test (huge flat dir only) could not see the depth/fault path.
- A7 spec phase (Felho side): before designing ANY content-hash gate over a third-party binary, observe its real update mechanism live — claude's native installer shipped four version files in three days (new version-named file + symlink repoint), so a sha256/size/exact-realpath pin would alarm on every legitimate auto-update and train the user to disable the check. Anchor on the structural invariants that survive updates: command path + install dir + owner/mode/ancestor checks.
- A7 spec phase (Felho side, owner-caught): gating an env-var attack behind another env var is circular — WIENERDOG_TEST=1 and WIENERDOG_RUNJOB_CMD share the same write surface (one systemd environment.d file write sets both). The fix deleted the seams instead of gating them (JS-injected deps in-process, pin-store-installed fakes cross-process) — and deletion bought free integration coverage of the real pin path the seams used to bypass.
- A7 spec phase (Felho side, owner-caught): state trust anchors precisely — the out-of-tree launcher lives on the SAME write surface (~/.wienerdog) as the app tree it guards, so "needs OS entry AND launcher to defeat" was false (launcher alone suffices). Walk the actual who-interprets-what chain before writing any boundary sentence; the honest fix named the protected class (scoped writes not reaching the launcher) and parked the entry-inlined bootstrap-hash upgrade ("2b") for A12.
- A7 spec phase (Felho side): an authorization-surface field protects nothing unless wired to the EFFECTIVE source — the descriptor's timeout was specced from the static job default while the runtime watchdog read cfg.timeoutMs, i.e. the field guarded a constant. When declaring "everything digest-covered, no exceptions", sweep every config knob (model was missing entirely) AND verify each covered field's actual source.
- Process (Felho side, 2026-07-19): the walkthrough session directly amended WP-154/156; the owner flagged the role-boundary violation — decisions belong to the walkthrough, spec amendments to wd-architect. The architect's normalize pass then caught two stale spots the inline edit had missed, vindicating the split. Also: bundle related owner decisions into one architect batch per walkthrough stop instead of one agent per sentence.
- ADR-0029 migration (Felho side, 2026-07-19): ritual greps miss `.github/workflows/` — the CI boundary job's `WP-[0-9]{3}` spec-extraction regex would have silently SKIPPED the Deliverables check for slug specs (fail-open, not fail-loud). When changing any identifier scheme, grep the workflow files first; a gate that mismatches its input degrades to a notice, not an error.
- WP-roadmap-retirement: block-level extraction of the ROADMAP narrative would have swallowed 16 of 34 entries — later entries had no `<!-- -->` separators, so dated headers hid inside contiguous blockquote runs. Line-level dated-header splitting + a quote-line conservation count (1025/1025) caught it; never trust block boundaries in hand-grown markdown.
- WP-roadmap-retirement (wd-reviewer finding): the spec's Current-state inherited "ADR index stops at 0020" from a review report instead of checking the live file (rows actually stopped at 0015, with 0020 present and 0016–0019 missing). Verify-before-assuming applies to spec Current-state sections too — a reviewer's snapshot is an indirect source.
- Process (Felho side, 2026-07-19): two sessions sharing one working tree — a red `npm test` may be the OTHER session's in-flight uncommitted edits. Before interpreting suite failures: `git status`, map failing test files to who's editing them, and stage only your own paths. Never stash or touch the other session's modifications.
- Process (Felho side, 2026-07-19): the direct-to-main flow has NO review gate — the ADR-0029 WPs got their wd-reviewer pass only because the owner asked afterwards (verdicts: 3× APPROVE, pre-push). The `pull_request`-scoped CI cannot cover main-committers; if direct-to-main survives into the canonical repo, the review ritual needs its own gate there.
- Process (Felho side, 2026-07-19, codex-review): one /codex:adversarial-review job reviews the whole spec batch in a single context — acceptable at 2–3 related specs, but reviewer quality likely degrades as batch size grows (attention spread across targets). For larger batches, spawn one review job per spec with tightly scoped focus text, plus at most one batch-level pass for cross-spec consistency; an LLM reviewer does better work with a smaller scope.
- Process (Felho side, 2026-07-19, subagent-writes): a wd-architect subagent's Write leaked a trailing `</content></invoke>` tool-call fragment into a logbook file end; markdownlint did NOT flag it (reads as an HTML tag). When a subagent authors files, spot-check the file TAIL for stray tool-call/XML syntax — lint won't catch it. Cheap guard: `git grep -nE '</(content|invoke|parameter)>' -- docs/` before committing subagent-written docs. UPDATE (recurred round-5): plain `git grep` SKIPS untracked files, so it misses brand-NEW subagent files — exactly where the leak lands. Use `git grep --untracked -nE …` or a `tail -1` loop over the actual file list (tracked AND untracked) instead.
- WP-154 impl (Felho side): pin-time and verify-time executable resolution MUST run under the same PATH — the spec's bare `createPins(paths,{manifest})` would pin under the interactive shell PATH while the nightly job resolves under `buildCleanEnv`'s job PATH, so any ordering difference (claude/git dir precedence) false-drifts every night. Sync passes the job clean env to createPins.
- WP-154 impl (Felho side): the root-owned-writable-ancestor rule (sticky /tmp passes; a non-root group-writable ancestor fails) is only testable against the REAL /tmp — macOS `os.tmpdir()` is a per-user private path (`/var/folders/...`), so a fixture there never exercises the sticky-but-root-owned case.
- WP-155 impl (Felho side): deleting the fakeCmd seam made spawnBrain's `--version` probe unconditional, so test fakes must handle `--version` explicitly or the probe re-runs their side effects; a fixture's `hang` mode would now block sync ~10s on the probe. Discovered issue: update-check.test.js's comment still names the deleted WIENERDOG_RUNJOB_CMD (out of Deliverables, left).
- WP-144 impl (Felho side): schema validation must run BEFORE the deferred-member guard in reverse() — an invalid entry's path may not even be a string, and the guard's realpath arithmetic must never see it. Ordering: validate → guard → root-bound → per-entry try/catch.
- WP-145 impl (Felho side, INCIDENT): a test that clears the hard scheduler guard (`WIENERDOG_TEST_NO_REAL_SCHEDULER`) to let a stored-unload marker spawn becomes a REAL OS mutation the moment the code re-derives the argv — my full-suite run bootout'd the developer's live `ai.wienerdog.{dream,catchup}` launchd agents. The correct pattern is a spy on the `schedulerSpawn` chokepoint (nothing real ever spawns); disabling the guard is never acceptable. Also: reverseSchedulerEntry has callers beyond reverse() (schedule.js `remove` + 7 tests) — minimal-reconcile + Discovered issues, not silent scope expansion.
- WP-157 impl (Felho side): an out-of-tree verifier must INLINE its root of trust (path resolution + containment + app-tree content hash) — requiring them from the very tree it verifies defeats the purpose; only AFTER the tree-hash is verified may it lazy-require the derived step (deriveDescriptorDigest) from the now-verified tree. Two copies of appTreeDigest (launcher-inline vs descriptor.js) would refuse every dream if they drifted, so a byte-for-byte determinism-guard test between them is mandatory.
- WP-157 impl (Felho side, near-miss): the real repo has a `.git`, so a "prod-mode" vendor test using packageRoot() silently vendors in DEV mode and points app/current at the REAL checkout — an app-mutation test then wrote `// tampered` into the real package.json (caught, restored via `git checkout`). Test setups that vendor must copy a `.git`-free tree first (`vendor.copyTree` → temp source), so no test can mutate the running repo.
- WP-157 impl (Felho side): changing the OS-entry argv from `[bin, run-job, name]` to the out-of-tree launcher obsoletes the ADR-0013 stale-path repoint test premise — the launcher path is inherently stable, so re-test the repoint migration via the embedded NODE path (process.execPath), not the bin.
- WP-158 impl (Felho side): the job `run` action lives in the managed jobs block of config.yaml, not a top-level key — a fire-time drift test must flip it via `jobsLib.saveJob`, not by line-editing config. Also: putting the shared fixture-builder under `tests/scenarios/.../fixtures/` and importing it from the `tests/unit/` test keeps `node --test`'s `*.test.js` discovery from picking up the runner/fixture files while still driving the real modules from one place.
- WP-159 impl (Felho side): a docs-only WP's acceptance is not `--test-name-pattern`-based — the `wienerdog safety` all-five-BLOCKED check is what proves the prose didn't leak a gate-opening claim; docs verification = grep (glossary terms present, no overclaim) + `safety` + lint, not tests.
- WP-159 → scenario-harness leak (Felho side): the live scenario runners (run-scenarios.js, run-negative.js) run the real bin's `init --fresh-vault`, which auto-schedules the dream; they set WIENERDOG_HOME=temp but deliberately inherit real HOME and set no LOADER_NOOP, so launchAgentsDir(paths.home) resolves to the REAL ~/Library/LaunchAgents and a temp-core plist is written AND `launchctl bootstrap`ed — orphaned agents pointing at deleted temp cores. Now specced as WP-161.
- WP-161 codex-loop (Felho side): the design-review Codex gate converged over 3 rounds (8 findings, 0 hallucinations; high→medium→medium test-rigor) — each round attacked the NEW mechanism the prior fix introduced (init-env split, PATH shims, report-only observer), not just "prior findings fixed". A fix's own new surface needs adversarial re-review; budget for ≥2 rounds on a security-facing spec.
- WP-161 codex-loop (Felho side, tooling): `/codex:adversarial-review` focus text must contain NO backticks — the companion's `zsh -lc` command-substitutes them (round-2 fired a harmless `command not found: init` + a stale-path module error on stderr; the review still ran). Also: a COMMITTED spec needs `--base <parent-ref>` for Codex to see it (a working-tree review finds nothing), and interleaved unrelated commits on main must be excluded by name in the focus text.
- WP-161 impl: `const`/`let` declared inside a `try` block is out of scope in its paired `finally` — tripwire asserts that must run in `finally` need their handles hoisted (`let shim = null`) before the `try`, same as the runners' existing `root` idiom.
- WP-161 impl: node's `--test-name-pattern` matches test NAMES, not files — against a new file whose names don't contain the pattern it selects zero tests while still printing a green full-suite total. Prefix every test name with the file's slug so the documented targeted command is non-vacuous, and verify by counting matched names, not by exit code.
- WP-161 impl: `fs.readFileSync` on a directory throws `EISDIR` on macOS and Linux alike — a portable way to unit-test a non-ENOENT "unreadable file" fail-closed branch without chmod tricks (which break as root and on Windows).
- WP-161 impl: "absence = clean" is a fragile tripwire default — pre-creating the sentinel log at setup flips absence into tamper-evidence, turning two silent false-clean paths (failed shim append, premature temp-root deletion) into loud failures for free; it also hardens the F7 ordering contract as a side effect.
- WP-161 impl: when grepping for a serializer's output, mirror the EXACT function the product uses per format (3-entity `xmlEscape` for plists, `windowsXmlEscape` for Task Scheduler XML, `systemdQuote`'s inner transform for units) — a "safe superset" escape produces byte-forms the product never writes and misses forms it does.
- WP-161 impl: open-once-with-O_NONBLOCK → fstat the fd → read the SAME fd is strictly stronger than Dirent-filter + stat-then-read: it collapses the stat/read TOCTOU, the DT_UNKNOWN readdir quirk, and the symlink-to-FIFO blocking hazard into one structural pattern with fewer branches.
- WP-161 impl: in a JS template literal emitting shell, only `${` needs escaping (`\${VAR:-...}`); `$(dirname "$0")` passes through untouched — env-fallback shell idioms embed cleanly.
- WP-161 impl: an accepted-residual note must name the benign failure mode (ENOSPC/EDQUOT) alongside the adversarial one, and state what still holds (prevention intact, only detection redundancy degrades) — a residual scoped only to "attackers" invites false confidence on ordinary full-disk runners.
- WP-161 double-gate (our side): the implementation Codex loop ran 4 rounds (6→4→4→1 findings, 0 hallucinated, every one source-verified real) and each round attacked the mechanism the PREVIOUS fix introduced — matches the design-loop lesson above; budget multiple rounds for security-facing test-infra too, and declare an explicit convergence rule (maintainer adjudicates against the threat model) so the loop terminates honestly.
- WP-161 orchestration: never run a mutation-testing reviewer concurrently with another reviewer in the SAME worktree — Codex observed a transient `if (false) { // MUTANT` mid-review and had to fall back to the committed blob. Sequence the gates, or give the mutating reviewer its own copy.
- WP-dream-plaintext-trigger (P0 incident): the 0.10.0 hermetic dream shipped with the `/wienerdog-dream` slash-led -p prompt that WP-routine-plaintext-trigger had already fixed for routines — when a compat fix lands for one brain-spawn surface, grep for the SAME pattern on every other surface (`grep -rn "'/wienerdog" src/`) before closing; the dream ran vacuously ("ok, 0 notes") for a full night before detection.
- WP-dream-plaintext-trigger: claude 2.1.217 rejects a -p prompt whose FIRST LINE is a slash command even when more text follows — broader than the 2.1.216 "prompt is only /<skill>" behavior the routine fix documented.
- WP-dream-plaintext-trigger: "ground the abort in behavior, not text" — a guard keyed on model-influenceable output must be compounded with a side-effect check entailed by the genuine failure (here: CLI rejection ⇒ zero vault writes); the text signal selects the failure class, the behavior check makes it unspoofable in both directions (false-abort DoS and silent-noop).
- WP-dream-plaintext-trigger: the whole-output discriminator ("the diagnostic IS the entire output", ANSI-stripped + trimmed) beats any substring/anchored marker for CLI-diagnostic detection — it kills the false-positive and false-negative classes simultaneously.
- WP-dream-plaintext-trigger: when a guard's evidence probe can itself fail, "no evidence" is a third outcome that must be discriminated from both verdicts — collapsing probe-error into either side re-opens one of the failure classes the guard separates (probe-error→"dirty" resurrected the vacuous-certification incident within one review round).
- WP-dream-plaintext-trigger: byte-exact emptiness (`=== 0`) on streams is almost always wrong for "no meaningful output" — normalize (ANSI-strip + trim) first; a lone "\n" defeated the stderr fallback.
- WP-dream-plaintext-trigger: fault-injection fixtures must model the fault's real LIFECYCLE — a transient fault injected as persistent lets a downstream same-shape failure mask a swallowed error, so the test passes under the very mutant it exists to kill; fail-once-then-recover wrappers + actually running the mutant is the two-minute proof.
- WP-dream-plaintext-trigger (process): dev-stance install means merging to main IS deploying to the live machine — the P0 was introduced by a routine local fast-forward. Treat main-merges on a dev-stance repo as production deploys: same-day verification of the live scheduled jobs after any merge touching their path.
- WP-dream-plaintext-trigger (process): the maintainer-amendment loop (implementer flags a Deliverables gap under Discovered issues → maintainer amends the table with a provenance note → implementer applies in the same commit) is now the standard remedy for the recurring "shared constant literal-matched in an unlisted test file" spec under-scope.
- WP-cleanenv-keychain-auth (P0, root cause of the dream outage): claude ≥2.1.216 migrated its OAuth token into the macOS login Keychain and DELETED ~/.claude/.credentials.json; when CLAUDE_CONFIG_DIR is explicitly set (even to the default ~/.claude) claude ignores the Keychain and 401s. buildCleanEnv set it unconditionally → every 0.10.0 hermetic dream/routine failed auth in production. The terminal-vs-launchd framing in ADR-0025 Amendment 4 was wrong; the invariant is CLAUDE_CONFIG_DIR presence, corrected in Amendment 5.
- WP-cleanenv-keychain-auth: os.homedir() on POSIX reads $HOME LIVE (libuv checks the env var before the passwd DB), so it can NEVER be the "real login home" side of a redirection discriminator — the redirect mechanism itself moves it. os.userInfo().homedir (getpwuid, env-independent) is the correct anchor. wd-reviewer approved the os.homedir() version; Codex's adversarial leg caught the branch-flip (a HOME-redirected sandbox reaching the real Keychain) — the double gate's independent second perspective is exactly what saved it.
- WP-cleanenv-keychain-auth: a confinement/security test that constructs `paths` manually can be vacuous against the real entrypoint — the branch-flip was only exposed by an entrypoint-shaped test that mutates process.env.HOME then calls getPaths(process.env). Test the discriminator through the real path-derivation, not a hand-built object.
- WP-cleanenv-keychain-auth: omitting a var from an env built FROM SCRATCH is not inheritance — the hostile-ambient test (set process.env.CLAUDE_CONFIG_DIR=/evil, assert absent) proves omission≠inheritance and locks it against a future ENV_PASSTHROUGH addition.
- WP-cleanenv-keychain-auth (process): the non-vacuity dream guard from the SAME day's prior P0 is what surfaced this one — the pre-auth "Unknown command" rejection had been masking a hard 401 behind vacuous "0 notes" commits for two nights. A loud-failure guard on a scheduled job converts a silent multi-day outage into a same-hour diagnosis.
- WP-scheduler-loaded-record-tripwire: `--test-name-pattern` is a **regex**, not a literal. A contracted test name containing `(`, `)`, `[`, `.` or `+` makes the spec's own mutation command select zero tests and exit 0 — which reads as "mutation survived" against correct code, or worse as "test passed" against broken code. Always confirm the reporter emitted a `not ok N - <the test name>` line, never just the exit code.
- WP-scheduler-loaded-record-tripwire: a mutation whose only effect is to change a *condition* often is not red, because the code falls through to a later fail-closed branch and produces the same shaped output. M3b had to be written as an injected `return [];` rather than as `if (false)`, because with the condition disabled the `status: 112, stdout: ''` fixture still failed on the missing `services = {` opener and the test stayed green. Design the mutation against the *fixture*, not against the source line.
- WP-scheduler-loaded-record-tripwire: this repo's worktree tooling refuses multi-command shell one-liners with loops and `||`-chained exits, so the spec's `for f in …; do … done` verification steps had to be run one file at a time. Same evidence, but worth writing verification steps as independent single commands where possible.
- WP-scheduler-loaded-record-tripwire: `grep -c` exits **1** on a zero count. It is fine as the *positive* half of a gate (`… | grep -c pattern` → 37, exit 0) but it silently doubles as a failure signal, so a step that pipes it into `[ "$n" -ge N ]` under `set -e` would die before the comparison ever ran.
- WP-scheduler-loaded-record-tripwire: monkeypatching `fs.readFileSync` / `readdirSync` / `openSync` on the shared `node:fs` module object is a sound way to assert "this function reads no file", but only because the function under test is fully synchronous — the spy window is exactly the call. Restore in a `finally`, and keep permitted metadata calls (`fs.realpathSync`) deliberately outside the spied set, with a comment saying why.
- WP-stance-authority-containment: a spec that prescribes exact JSDoc text can contradict its own source-walk test — the `installStance` contract literally contains `env.WIENERDOG_DEV` while AC10/T3/V7 forbid that token anywhere under `src/` outside the launcher. Comments are lines in `.js` files; a token ban is a ban on prose too. Resolve toward the executable gate, not the prose.
- WP-stance-authority-containment: `grep -c` and bare `grep` exit 1 on zero matches, so V6's success condition (`no output`) reads as `EXIT=1`. A verification block that says "required after: no output" needs the exit code stated too, or the next implementer will read a correct run as a failure.
- WP-stance-authority-containment: mutation-matrix rows are claims that need executing like any other. Two of Table E's ten did not turn their named check red, and both for structural reasons the spec could have derived — an assertion written as an alternation cannot isolate one of its own branches (row 8), and a mutation whose effect is masked by a *different* row of the same WP is unobservable in isolation (row 9). Prefer one assertion per guard over a regex alternation when the test's job is to isolate a guard.
- WP-stance-authority-containment: revert mutation experiments by saving and restoring file **bytes**, never `git checkout` — a driver that shells out to git inside a work-package branch is one typo away from discarding committed work, and a byte-restore is verifiable with `git status --short`.
- WP-stance-authority-containment: `tests/unit/vendor.test.js` may import `tests/scenarios/a7-integrity/fixtures/build.js` without editing it, but `stubForeignOwner` matches its target by **exact string**, so it must be handed `fs.realpathSync(<core>/app/current)` — the resolved target — not the symlink path. Handed the symlink, the stub never fires and the test passes vacuously while claiming to prove ownership does not select an arm.
- WP-stance-authority-containment: an empty directory is invisible to a content-address that walks only `isFile()` entries. Any test that plants an empty directory expecting a digest to move is asserting nothing — assert the digest is *unchanged* instead, and make that the point.
- WP-scheduler-entry-identity: `--test-name-pattern` is a REGEX, and this WP's test names contain `[1]`, `(darwin)`, `(c0)` and `"…"`. An unescaped pattern silently selects zero subtests and the runner still exits 0 with "pass 1" (the file wrapper counts). Every mutation check must assert the pattern selected exactly ONE named line, not merely that the run failed.
- WP-scheduler-entry-identity: a mutation that introduces a SYNTAX error looks identical to a mutation that turns a test red, because both make the run non-zero — but it proves nothing. M2's first form left an unbalanced brace; the "selected exactly one `not ok` line for this exact name" check is what caught it. Prefer mutations that insert an early `return` above the original code over ones that wrap it in a block.
- WP-scheduler-entry-identity: `path.win32.join('C:\\x\\.\\', 'launcher', 'launch.js')` collapses the `.` component, so a fixture that passes the same non-canonical `core` to both the writer and `path.win32.join` produces a CANONICAL expectation and a NON-canonical bind — which is exactly the asymmetry rule 4a exists to catch. Assert that collapse in the test (`assert.equal(launcher, WIN_LAUNCHER)`) or the fixture silently stops testing what it claims.
- WP-scheduler-entry-identity: widening `defaultProbe`'s signature was safe for the whole existing suite only because every injected `opts.probe` ignores extra arguments. `probeAll` forwards `{ run: opts.run }` unconditionally, so the property is present-and-`undefined` on every production call — the seam test must be `typeof opts.run === 'function'`, never `'run' in opts`, or production takes the test path.
- WP-scheduler-entry-identity: building the (c0) expected-name list by reading `scheduledEnvPairs()` at runtime (names + which values are scrubbed to `''`) instead of retyping the eight names means the checker cannot drift from the writer. Same move as Table B1's `BARE` reusing `cmdArgToken`'s charset. When a spec says "cite, do not restate", a runtime read is usually available and is strictly better than a comment pointing at the source.
- WP-scheduler-entry-identity: the pre-destructive marker's `refreshSchedulerStatus` re-enters `probeAll` with the SAME `opts`, so a recording loader that reads `state/scheduler-status.json` at every call sees the file already written at call 1 — but only if the injected `probe`/`run` seam is forwarded too. R4 ("a mandatory seam is forwarded, not just accepted") is what makes the marker assertion spawn-free; forgetting it would have driven a real `launchctl` under the marker.
- WP-refusal-remedy-discriminator: this agent runs in a git worktree whose `pwd` is the worktree path, but `Read`/`Edit`/`Write` tool calls default to resolving bare repo-root-relative-looking absolute paths against the *shared* checkout, not the worktree — every file edit had to be re-issued with the worktree's absolute path prefix once the mismatch surfaced. Worth a note for future spec-runner tooling: verify the edit tool's cwd assumption before the first `Edit` call in a worktree session, not after the first rejection.
- WP-refusal-remedy-discriminator: the spec's own quoted `npm test` baseline (`tests 1671, pass 1666, fail 0, skipped 5`) was measured before `WP-stance-authority-containment` merged into this tree; the real pre-this-WP baseline on the dependency-merged tree is `1681/1676/0/5`. The *delta* (+10 tests, 0 new fails) is what the gate table actually needs, and it held — but a reviewer diffing raw counts against the spec's literal numbers would see a false 20-test gap unless they re-derive the baseline via `git stash` first, as this PR did.
- WP-launcher-no-self-resync-republish: a spec's Current-state analysis frozen at a commit before its own `depends_on` merged is a live hazard — the dependency's merge can add a test that invalidates a "no existing test is a self-resync" claim the spec relied on. Worth a convention: re-verify grep-based Current-state claims against the dependency's actual merged tree before dispatch, not just before drafting.
- WP-launcher-no-self-resync-republish: when a fixture hand-builds installer state (e.g. manually symlinking `app/current` instead of calling the real vendoring path), it can silently violate invariants a later change relies on (here, "a real install always has an out-of-tree launcher"). The fix belonging in the fixture rather than the code-under-test was non-obvious until Table M's M7 made the load-bearing distinction (guard vs. fixture) checkable.
- WP-launcher-no-self-resync-republish: `git stash` does not touch untracked files by default — useful for isolating "does my code change alone cause this failure" from "does my new test file interact with it", but easy to forget when reasoning about what got reverted.
- WP-launcher-no-self-resync-republish: the sandboxed Bash tool refuses multi-line heredocs containing embedded `git` invocations ("too complex to verify it stays inside the worktree") — writing the Node verification scripts (V0/V3/V4/V5/V8) to standalone files under `/tmp` and running `node <file>` sidesteps this cleanly and is worth defaulting to for any spec that ships heredoc-based verification steps.
- WP-launcher-no-self-resync-republish (spec loop): a `Current state` section that makes a claim about the *test suite* has a shelf life bounded by its dependency's merge. When a spec's `depends_on` edits test files, any suite-wide claim in the dependent spec must be re-verified against the merged tree before dispatch, not only at draft time.
- WP-launcher-no-self-resync-republish (spec loop): "no existing test is a self-resync" was the wrong invariant to assert. The right one, which would have survived the merge, is "every fixture that self-resyncs models a real installed core". Prefer invariants about fixture *shape* over head-counts of call sites.
- WP-launcher-no-self-resync-republish (spec loop): a verification step that guards *properties of a diff* (no deletions, no `assert` lines) is a proxy, and proxies admit counterexamples. When the invariant is "this file is exactly that file plus this known edit", **compute the expected content and compare it** — and make the reconstruction fail loudly when its anchor does not match exactly once, so a zero-match insertion can never read as agreement.
- WP-launcher-no-self-resync-republish (spec loop): a verification step that reads the **working tree** cannot prove anything about what gets pushed. When a gate's claim is about the committed state, read the blob (`git show HEAD:<path>`) *and* refuse to run against a dirty tree; either guard alone leaves the other half of the hole open.
- WP-launcher-no-self-resync-republish (spec loop): a clean-tree precondition scoped to one path proves nothing about gates that read other paths. If any verification step executes or greps the working tree, the whole sequence needs a single tree-wide Step 0; per-gate guards can only ever cover the file they name.
- WP-launcher-no-self-resync-republish (spec loop): `git status` is not a truth oracle about the worktree: `assume-unchanged` and `skip-worktree` make it lie by design. Any gate that treats an empty `git status --porcelain` as proof must first assert `git ls-files -v` shows no lowercase tag and no `S`.
- WP-launcher-no-self-resync-republish (spec loop): local verification gates defend accidents, not adversaries; the gate and the adversary are the same process. Once a review starts producing "more exotic local evasion" findings, the answer is to *declare the boundary and name the structural remedy* (an independent re-run from the pushed branch), not to keep hardening. Hardening that class is a race with no fixed point.
- WP-launcher-no-self-resync-republish (spec loop): `|| true` on a *pipeline* suppresses every stage's status, not just the expected "no match". A probe whose contract is "prove X is absent" must capture the producer's status and the filter's status separately, and must distinguish "filter ran and found nothing" (proceed) from "filter could not run" (fail closed) — otherwise a broken dependency reads as a clean result.
- WP-launcher-no-self-resync-republish (spec loop): a sweep claim must name the **property** it swept for and the **method**, not the string it grepped. "I searched for `|| true`" is not evidence that no probe can false-PASS; the same defect wears `awk | grep -c`, `[ -n "$(cmd)" ]`, and an empty variable in a numeric test. State the shapes, enumerate every block including the ones found clean, and prove it by breaking each probe.
- WP-launcher-no-self-resync-republish (spec loop): when three consecutive rounds falsify a verification claim and each falsification is of the *previous fix*, the defect is the medium, not the instance. Shell's default is fail-open, so multi-stage probing in `sh` regenerates "probe failure looks benign" from every repair. Move the gate to a language where an unhandled failure is a non-zero exit by construction; the review obligation then shrinks from "audit every stage's status" to "no `catch`, no fallback".
- WP-launcher-no-self-resync-republish (spec loop): a source-scanning gate must anchor on a token that cannot be a *prefix of something else* (`function writeLauncher(` not `function writeLauncher`) and must count only *executable* text, or ordinary refactors — a helper with a longer name, a literal quoted in a comment — silently satisfy it. And when a gate is rewritten, its recorded arm output is stale evidence until re-run: retranscribe from a real run, never reword.
- WP-launcher-no-self-resync-republish (spec loop): a text scan over source cannot establish a property of *executable syntax*, and no amount of regex hardening changes that; the honest move is to bound the claim. Before reaching for reconstruction as the alternative, check whether the target edit is genuinely byte-determined — an elided snippet or a JSDoc assembled from two partial fragments is not, and a reconstruction gate over it would fail correct work. Screens are legitimate when labelled as screens and paired with behavioural evidence.
- WP-launcher-no-self-resync-republish (spec loop): the same lesson at one more level: a *behavioural* test proves behaviour. If a contract is about the **form** of the source, its violation can be behaviour-preserving, and no test suite establishes it — only a reader does. When you demote a gate from proof to screen, check what you promoted in its place: I moved the claim onto T1–T4 without asking whether behavioural tests could carry it, and they could not.
- WP-launcher-no-self-resync-republish (spec loop): when a correction is applied across mirrors, the *disclosure* rows are the easiest to miss, because they read as caveats rather than claims. A row that says "this is why X cannot establish Y" is still asserting who *does* establish Y, and inherits the same attribution. Sweep by the claim, not by the section heading — and enumerate the mirrors rather than counting them from memory.
- WP-launcher-no-self-resync-republish (spec loop): a mirror registry must enumerate **editable locations**, not conceptual groups: "the PASS-line texts" reads as one entry and is four files-worth of separately editable places. And when a registry reports counts over its own document, spelling the searched token inside the registry changes the count it reports — state the unit, and keep the registrar out of its own sample.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): a TAP `ok` line is not proof a test ran — node:test renders `# SKIP` and `# TODO` records as `ok … ` with exit 0, so any non-vacuity gate built on counting `ok` lines must exclude directives AND separately fail if a required name carries one (extra passing names must not substitute for excused ones).
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): a gate that counts successes is blind to everything that is not one — it cannot see a `not ok`, and cannot see a failure that emits no record at all (a throwing file-level hook). Capture the runner's exit status and fail BEFORE counting; `$(...)` swallows it unless `$?` is read on the very next statement, and `local x=$(...)` overwrites it with `local`'s own status.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): a floor with slack is not a weaker floor — five names of slack meant five required tests could fail while the gate stayed green. Zero-slack, re-enumerated on every change; never increment a floor narratively.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): a host prerequisite must be evaluated in the runtime whose behavior it predicts — `id -u` and `process.platform` disagree exactly where it matters (Git Bash on Windows), so a shell-side guard on a Node-side property is a category error that reads as correct.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): when a check draws findings two rounds running it is testing a proxy for its invariant — comparing an extracted ID sequence against the literal expected sequence retired three arithmetic guards at once (count, order, substitution, duplication). Ask what fact the guard stands in for and assert that instead.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): a strict extractor makes non-conforming input invisible, and invisible is worse than missed because the check then reports success. Prefer a permissive matcher feeding a strict comparison, widen at every position the format permits (GFM: compact `|G6|` cells AND 0-3 leading spaces), and pair every widen with a case that must stay outside it or the new bound is unproven.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): an adversarial review criterion of the form "construct input that slips through" has no fixed point; it terminates only when the check declares its threat model (accidental format-conforming drift by trusted editors) and names the structural remedy for the rest (review). Declared honestly, the next Codex finding was in-scope and real, not exotic.
- WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): "keep these two copies identical" is not a contract until something asserts it — three careful rounds still forked four of seven canonical rows because each round only checked the row it touched. If a spec claims a cross-file invariant, ship the check that fails on it, and make a missing anchor fail loudly (two empty extractions diff clean).
- **WP-secret-fence (round 1):** a positive grep sentinel can be *unsatisfiable*,
  not merely stale — verify a replacement by running it, and remember `grep -F`
  matches within one line while prose wraps.
- **WP-secret-fence (round 1):** `^[> *]*` prefix classes contain a **space**, so
  an indented line whose first token is the marker matches. Quoting a gate's own
  marker in documentation can trip the gate.
- **WP-secret-fence (round 1):** BSD awk (macOS) silently matches nothing for
  GNU's `\<`/`\>` word anchors — an extraction range built on them produces an
  *empty* permitted-removals list, and `grep -vFf` against an empty file removes
  nothing, inverting a bound into a vacuous pass.
- **WP-secret-fence (round 1):** a digest gate that sweeps its own document's
  frontmatter will redden on the lifecycle transitions that document mandates.
- **WP-secret-fence (round 1):** when a repair is available, measure it before
  declining it — the metadata-suffix narrowing looked right and was leaky, and
  only building it showed that.

- **WP-secret-fence (round 3):** a fault injection for a guard must perturb the
  system on the side the guard can act on — one round-1 injection put the
  perturbation where the guard *must* catch it (so it demanded an outcome the
  correct design forbids) and one where it *cannot* (so the injection disproved
  its own assertion).
- **WP-secret-fence (round 3):** a probe built with `sed 's/^status: Draft$/…/'`
  goes vacuous the moment the status is no longer Draft — normalize with
  `s/^status: .*/…/` so the substitution is a real rewrite from any state.
- **WP-secret-fence (round 3):** apply a reviewer's *resolution* by running it,
  not by trusting the line it names — two of round 2's stated resolutions were
  insufficient or pointed at the wrong line, and only execution showed it.
- **WP-secret-fence (round 3):** two invariants stated side by side can be
  jointly unsatisfiable at a boundary neither mentions; state a precedence, and
  test the boundary rather than the typical case.
- **WP-secret-fence (round 3):** when a canonical table's row type changes,
  update the whole column in one pass — updating the two rows the change was
  noticed on and leaving seven is how a "single place every value is decided"
  stops being one.

- **WP-secret-fence (round 4):** when a repair restates the very figure the same
  commit forbids restating, the family's *bounds* are the defect — extract the
  arithmetic into one table whose rows are the deciding surface, and let every
  other site cite it.
- **WP-secret-fence (round 4):** a read's **failure outcome** belongs to the
  read's contract, not to the row it lands in; stating it per-row is how two
  rows came to claim one input with opposite artifact outcomes.
- **WP-secret-fence (round 4):** two invariants can be individually correct and
  jointly unsatisfiable at a trigger condition neither mentions — write the
  trigger and the lifetime into the same table and the contradiction is
  unmissable.
- **WP-secret-fence (round 4):** prefer keeping a safety property and correcting
  the claim over relaxing the property to make a sentence true.
- **WP-secret-fence (round 4):** verify a scripted multi-line replacement by
  diffing the document's heading list before and after — a range that
  over-matches deletes silently and lint will not notice.

- **WP-secret-fence (round 5):** "does a durable copy exist" and "is the file I
  am about to destroy recoverable" are different questions, and a guard that
  asks the first while acting on the second loses data whenever a third party
  changes the file.
- **WP-secret-fence (round 5):** when two injections each vary one axis of a
  two-axis failure, the destructive cell is the *product* and neither test
  reaches it — check the cross-product explicitly.
- **WP-secret-fence (round 5):** re-keying colliding ids means renaming the
  *table* too when the table letter is the row prefix; otherwise "Table D row
  D2" and "derived row D2" stay ambiguous.
- **WP-secret-fence (round 5):** appending a correction as commentary leaves the
  false assertion standing — edit the assertion.
- **WP-secret-fence (round 5):** a census that quotes the digits it catalogues
  matches itself; write the dispositions without the figures or it never
  converges.
- **WP-secret-fence (round 5):** a claimed walk is worth nothing without its
  executed output — run the grep, paste the hits, disposition each one.

- **WP-secret-fence (round 6):** a check cannot authorize a *later* destructive
  operation on a file another process can write — the only sound fix is to take
  the file (`rename(2)`) rather than inspect it and trust the inspection.
- **WP-secret-fence (round 6):** before treating a race as this WP's, check
  whether shipped `main` already has it — an inherited race is a residual and a
  named follow-on, not a blocker, and the distinction changes who decides.
- **WP-secret-fence (round 6):** never run a completeness sweep over a *filtered*
  view of the document — rounds 4 and 5 swept the residue view, which is blind to
  bash fences, which is exactly where the stale mirror lived.
- **WP-secret-fence (round 6):** if a document excludes a region from its own
  enforcement, no registered mirror may live there; move the prose out rather
  than widening the sweep.
- **WP-secret-fence (round 6):** when a fault injection perturbs at one point,
  check which *branch* it lands in — FI-17/18 perturbed at K2 and so only ever
  exercised the mismatch branch, leaving the throw branch untested and
  exploitable.

- **WP-secret-fence (round 7):** when the same registration defect survives four
  rounds of hand-walks, the walk is the bug — derive the membership from the
  document and let the step's output be the walk.
- **WP-secret-fence (round 7):** a fail-closed registry needs its exclusion list
  described honestly as a backlog, and needs to fail on *stale* exclusions too,
  or the carve-out widens silently.
- **WP-secret-fence (round 7):** three id collisions were three numbers written
  down — replace the figure with the command that derives it.
- **WP-secret-fence (round 7):** check that a fault injection's trigger actually
  reaches the branch it targets; FI-19's patches never caused a fall-through, so
  the row and its mutation were both decoration.
- **WP-secret-fence (round 7):** a terminology gate built on negation words fails
  on multi-line prose and matches its own failure message — use a prose view
  minus a registered list, the shape the document already had.

- **WP-secret-fence (round 7.5):** when a decision is answered, sweep for *every*
  surface that framed it as open — an earlier decision in the same document had
  carried "OWNER DECISION REQUIRED" for four rounds after it was answered, and
  only an executed sweep found it.

- **WP-secret-fence (round 8):** a claimed fix is not a fix. Two consecutive
  rounds recorded repairs the tree never received; both were caught in seconds by
  hashing the disputed cell at each commit (`git show <rev>:<file> | grep '^| …'`).
  Verify by extraction and hash, never by reading the round's own note.
- **WP-secret-fence (round 8):** a mechanized check needs an adversarial run
  against its OWN published bypass before it ships. Three of this round's
  mechanisms passed their bypass after the obvious repair — V-31 still missed the
  wrap attack because the subject word was `destructive` and the stem was
  `destro`, and only running the attack revealed it.
- **WP-secret-fence (round 8):** a digest literal quoted in prose that the same
  digest sweeps has no fixed point. Keep the value inside the excluded region and
  say in prose that you did.
- **WP-secret-fence (round 8):** "registered" and "named" are different claims. A
  registration checker that greps for a mention proves nothing is *unnamed*; say
  so in the register's own row rather than letting the count read as coverage.
- **WP-secret-fence (round 8):** an enumerator regex is a schema assumption. One
  pattern over every table silently excluded three whole id families here; derive
  the schema per table and fail on a table the schema does not name.

- **WP-secret-fence (round 9):** when the same *family* produces the blocking
  finding five rounds running, stop improving the check and extract its contract.
  The test of a real extraction is that the checker holds no second copy of what
  it enforces — if it still carries the pattern, it will still drift.
- **WP-secret-fence (round 9):** a word-boundary is not a boundary. `\b` matches
  `C3` inside `C3-19`; an id boundary needs `(?<![A-Za-z0-9])X(?![A-Za-z0-9-])`,
  and an unbounded substring test is a false-positive machine — closing round 8's
  false negative left its mirror image wide open.
- **WP-secret-fence (round 9):** an enumerator must see the document as an
  implementer leaves it, not as the author wrote it. Ticking the checkboxes on an
  acceptance-criteria list is normal use, and it made all fifteen criteria vanish.
- **WP-secret-fence (round 9):** widening a check's view is not free. Including
  the fenced blocks was mandatory and correct, and it immediately produced five
  false positives because a fence has no blank lines — bound the window, or the
  check gets bypassed by hand instead of by regex.
- **WP-secret-fence (round 9):** verify the *harness* before believing the
  removal test. The first dead-entry run reported all 22 entries dead, because it
  deleted the entry from the swept copy while the step still read its allowlist
  from the pristine spec.

- **WP-secret-fence (final):** a decided sentence is not a contract until
  something fails without it. Round 9 wrote the escaped path into Q18 and the
  words `escap`/`hostile`/`ANSI` occurred on exactly one line of the document —
  the cell that decided it. Every field a canonical row decides needs an
  assertion and a mutation, or it ships as prose.
- **WP-secret-fence (final):** "escape it" is not implementable. Naming the
  algorithm (`JSON.stringify`) and asserting the *complete* rendering plus a
  collision pair is what separates a security control from a sanitizer that
  quietly makes two different paths look the same.
- **WP-secret-fence (final):** a cell that restates a canonical row's fields
  drifts in the same commit that changes them — B3b did, in the very round it was
  registered as that row's mirror. Cite; do not restate.
- **WP-secret-fence (final):** a mandate that offers two designs must not sit
  beside a test only one of them can pass; write both branches or make one
  mandatory.
- **WP-secret-fence (final):** when a gate is stopped by decision rather than by
  exhaustion, write down what is known to bypass the machinery, with the executed
  attack. The next reader then inherits evidence instead of an illusion of
  completeness.

- WP-secret-fence-two-tier-detector: `\s*` versus `[ \t]*` inside the
  context binder is not cosmetic — it decides whether mutation M-36 (deleting
  the same-line trim) is observable at all. With `[ \t]*` the binder cannot
  cross the newline on its own, M-36 becomes a silent no-op on C2 row 38, and
  AC-15 is violated by an implementation that looks *more* careful. The
  conservative-looking choice was the wrong one.
- WP-secret-fence-two-tier-detector: the spec's PRNG, seed and per-cell
  "one fresh RNG" rule are enough to reproduce a 156-cell measurement *exactly*
  — the labelled set, the regressing set and all six `today` constants landed
  on the first run. Pinning the generator rather than checking in sample tokens
  is what made that possible, and it is worth the extra fixture code.
- WP-secret-fence-two-tier-detector: `String.raw` and single-quoted JS
  literals are the only sane way to script mutations against a file full of
  template literals and regex sources. Two attempts at `sed`/`perl` one-liners
  produced silently non-applying mutations, which read as "the row stayed
  green" — i.e. as a spec bug. The runner now hashes the file before and after
  and reports "MUTATION DID NOT APPLY" separately from "GREEN".
- WP-secret-fence-two-tier-detector: measuring the C2 disposition *delta* per
  mutation, rather than only the exit status, is what turns C3-10 … C3-19 from
  prose into evidence. Several rows (M-5, M-39, M-44, M-42, M-52+M-5) are
  specified as exact multi-row outcomes where a weaker "some row moved" reading
  passes against a wrong implementation.
- WP-secret-fence-two-tier-detector: V-7 is the only step that reads a live
  corpus, so it is the only one that can go "red" for a reason that is not a
  defect. Reporting the drift explicitly (182 → 188 notes) beside the parts that
  *did* reproduce (M5's 1/9 split, the interim 10) is cheaper than either
  silently absorbing it or treating it as a blocker.
- WP-secret-fence-two-tier-detector: a measurement script whose output is
  designed to be pasted publicly must not echo an argument that is a private
  absolute path. The documented invocation writes `~/Obsidian/<name>`, which
  *reads* as anonymised — but the shell expands it before the script ever sees
  it, so `console.log(vaultPath)` published the developer's username and the
  vault's location into a public PR body. The intent lived in the docs and the
  leak lived in the code. Print a fixed placeholder; never the argument.
- WP-secret-fence-two-tier-detector: when a script *reproduces* a pipeline, the
  stage ORDER is part of what is being reproduced. Scanning the raw note with a
  context-free entropy pass looks equivalent to scanning it after the labelled
  rules and is not: a labelled credential gets counted twice and lands in the
  wrong bucket of the source breakdown. It went unnoticed because this corpus
  has exactly one labelled finding and it does not overlap an entropy run —
  i.e. the corpus could not discriminate the bug, which is the same failure
  mode the spec's own M4e register keeps recording about single-corpus
  evidence.
- WP-secret-fence-two-tier-detector: when a script emulates a PREVIOUS version
  of a pipeline, every rule the current version adds is a source of error, and a
  warning is not a substitute for refusing to report. The first fix printed the
  full M1 table with a caveat line underneath; the caveat would have been
  dropped the moment anyone pasted the numbers, because **a number that is
  printed will be quoted**. Emitting nothing is the only version of "this is not
  reproducible" that survives a copy-paste.
- WP-secret-fence-two-tier-detector: a guard that refuses to report should be
  gated on the condition that actually invalidates the report, not on the
  trigger that usually accompanies it. This one keys on "a rule this WP adds
  fired" when what invalidates the baseline is narrower — "a rule this WP adds
  consumed a body the shipped pass would have reported". Over-refusal is the
  safe failure and it is still a false alarm, and false alarms are what train
  people to bypass guards.

- **WP-secret-fence-ep2-redact-arm:** A fault injection that names a *mechanism*
  but not a *trigger* is unproducible in exactly the way the spec's own round-6
  finding describes — and it fails silently green, because the arm completes
  successfully and the assertion about the failure path is simply never reached.
  Before writing an injection, trace which rows its patches actually touch; two of
  this spec's rows (FI-10, FI-19) needed a trigger their cells did not name.
- **WP-secret-fence-ep2-redact-arm:** Read-counting seams must be anchored to a
  *structural* event, not to an ordinal. FI-19's "throw on the Nth read" broke
  because its own mandated trigger short-circuits before one of the reads it was
  counting. Anchoring on "the first read after this other thing failed" is immune
  to that, and to any future reordering.
- **WP-secret-fence-ep2-redact-arm:** A permitted-removals heredoc bounds *removed*
  lines, so rewrapping a JSDoc block near an edit fails the bound even when the
  edit itself is in scope. V-5 caught a rewrap of `listSecretQuarantine`'s doc
  comment that was pure tidying; the fix was to leave the original lines byte-exact
  and *append* the new sentence. The same trap bites single-line grep sentinels:
  my first `digest.js` comment rewrap split `CONTENT is never read or rendered`
  across two lines and V-5's positive `grep -qF` went red.
- **WP-secret-fence-ep2-redact-arm:** Mutation rows stating two independent changes
  in one cell cannot demonstrate that both clauses are held. Split them and run
  each; the spec's M-23 is the worked instance.
- **WP-secret-fence-ep2-redact-arm:** A mutation driver that edits `src/` in place
  makes the working tree lie for the duration. Commit first, and do not read source
  files while it runs — I briefly read a mutated `validate.js` and had to re-check
  it against the commit.
- **WP-secret-fence-ep2-redact-arm:** The retention fixtures are the slow ones (a
  51-note run is ~4s of git spawns and there are four such cases), which makes the
  full mutation sweep a ~25-minute job. Worth budgeting for, and worth *not*
  shortening the fixtures: the 51-note boundary is the only place the cap-yields
  precedence is observable at all.

- WP-scheduler-node-path-durability: `process.execPath` **realpath-resolves on
  POSIX** — launching node through `/opt/homebrew/opt/node/bin/node` still reports
  the Cellar path. Any design that assumes "register the alias, then compare
  `process.execPath` to it at fire time" is wrong from the start. Verify this with
  a one-line `node -p` before writing the comparison, not after.
- WP-scheduler-node-path-durability: a scheduler fix that changes a
  **digest-covered** field is not the same size as one that does not. Tracing
  `descriptor.node` → descriptor digest → the entry's `--expect-digest` → the
  launcher's fire-time re-derivation is what turned an apparently-obvious
  two-line fix into an explicit out-of-scope decision with a routed successor.
  Trace the digest closure of any field before adding it to a Deliverables table.
- WP-scheduler-node-path-durability: `grep -rn` for a helper is not enough — you
  must classify each call site by **lifetime**. `gen.nodePath()`'s nine callers
  split cleanly into six that write a string the OS keeps for days and three that
  spawn a child in the next millisecond, and only the first group has the hazard.
  A blanket change to the shared helper would have been fewer edits and the wrong
  fix.
- WP-scheduler-node-path-durability: design option "(b) detect it at fire time" is
  a reflex that dies on one question — *does any of our code run in that failure?*
  When the missing thing is the interpreter itself, the answer is no, and every
  variant of (b) either needs a daemon (ADR-0004) or reduces to the attended
  detection already shipped. Ask that question before enumerating alerts.
- WP-scheduler-node-path-durability: markdownlint's MD038 rejects a code span with
  a trailing space, so a spec cannot write a test-name prefix as `` `foo: ` `` to
  show the space is significant. Say "followed by one space" in prose instead.

- WP-scheduler-node-path-durability: a mutation table is only evidence if every
  fixture's arithmetic was **executed**. Four of round 1's fixtures exited at an
  earlier gate than the row they were filed under, so three mutation rows could
  never go red. The fix that generalizes is Table F — write the split/index/segment
  values into the spec as a table, produced by running the split, so a fixture and
  the gate it claims to test cannot drift apart.
- WP-scheduler-node-path-durability: when a fix's evidence is "stub the export and
  observe", check first whether the target even *imports* the module. `descriptor.js`
  has zero coupling to `generators.js`, so the test could never fail — and reassigning
  an exported property does not rebind a lexical call inside the module either. Both
  traps have the same tell: no `require` edge between the two files.
- WP-scheduler-node-path-durability: `process.execPath` is a writable, configurable
  property. That turns a whole class of "this assertion is only meaningful on my
  machine" tests into host-independent ones — fabricate the layout on disk, point
  `process.execPath` at it, restore in a `finally`. Check `Object.getOwnPropertyDescriptor`
  before assuming a `process` field is read-only.
- WP-scheduler-node-path-durability: fusing two validation gates into one contract
  row costs you both detectors. One gate per row, one fixture per row, one mutation
  per row — the moment two conditions share a row, no mutation can isolate either.
- WP-scheduler-node-path-durability: a limitation disclosed in prose while the
  acceptance criteria assert the cheerful half is not disclosed. AC6 asserted file
  idempotence, which a reader converts into "converged"; the honest fix was to make
  the non-convergence a canonical table, cite it from AC6's own text, and require the
  PR to reproduce it.
- WP-scheduler-node-path-durability: "the regex is the security gate" deserves the
  same skepticism as any other inherited claim — trace which validated segment
  actually reaches the constructed value. Here `version` never entered the path at
  all, and the real boundary was the realpath identity check two rows later.

- WP-scheduler-node-path-durability: a contract row covering two platforms is a
  latent defect even when it is currently true of both. Fusing linux and windows
  into one Table C row meant the first counter-example to the linux half would have
  dragged the (stronger) windows claim down with it. Split rows by the thing that
  can diverge, not by what reads compactly today.
- WP-scheduler-node-path-durability: "best-effort" in a comment is a load-bearing
  contract term — go read what gates the success value. Here `daemon-reload` was
  best-effort and ungated while only `enable --now` set `loaded`, which is exactly
  how a degraded reload becomes a reported success. Grep for what assigns the
  variable the caller reports, not for what the function calls.
- WP-scheduler-node-path-durability: before claiming a self-heal path exists on a
  platform, check that the platform's probe can produce a status *in the heal set*.
  systemd's identity query is declared unimplemented, so it always probes
  `unknown`, which is not healed — the macOS "it repairs itself one upgrade late"
  story has no Linux counterpart at all, and assuming symmetry would have
  understated the risk.
- WP-scheduler-node-path-durability: the Deliverables table is the permission
  boundary an implementer reads *first*, so it must be registered as a mirror of
  every table it restates. Round 2 renumbered T3→T5 and updated five registered
  surfaces; the one unregistered surface was the Deliverables cell, and it was the
  one that would have shipped the wrong test set. Register the permission boundary
  itself, not only the prose that explains it.
- WP-scheduler-node-path-durability: when a spec requires a literal to be copied
  into a merge artifact, verify it by string containment against the source file
  rather than by reading — two of round 2's literals differed from the code by a
  trailing period and a `(launchd)` suffix, both invisible on a careful read.
- WP-scheduler-node-path-durability: if a blocker is enforced only by prose, say so
  in the blocker. Naming the single step that makes it mechanically checkable
  (`depends_on` gains the id) is more useful than restating the prohibition, and it
  puts the fix at the exact moment the blocker lifts.

- WP-scheduler-node-path-durability: a test that fabricates a filesystem layout
  inherits that platform's path grammar. Realpathing a temp dir yields
  `/private/tmp/...` on macOS and `C:\Users\...` on win32, and a POSIX-shaped
  contract returns the latter unchanged — so the fixture stops testing what it
  claims and fails against correct code. Gate layout-fabricating tests to the
  platform whose grammar the contract is written in.
- WP-scheduler-node-path-durability: check the CI matrix before calling something
  a CI breaker, and fix it anyway. The finding was latent rather than live here —
  reporting that accurately costs nothing and keeps the severity signal
  trustworthy, while the fix still lands at full strength.
- WP-scheduler-node-path-durability: "effectively unreachable" is the kind of
  shortcut that misleads the next author. The precise version — reachable via one
  status, unreachable for this specific scenario because an earlier step
  short-circuits — was both more accurate and a stronger argument. When narrowing
  a claim makes it stronger, the claim was wrong.

- **P0-docs-pass:** A fault-injection row that names a *mechanism* but no *trigger* fails
  **green**. The patch is never reached, the arm completes on its success path, and the assertion
  about the failure path is never evaluated — so the row, the test and the mutation sweep are all
  green while nothing is proved. Absence, not error, which is why a column schema catches it and
  re-reading does not.
- **P0-docs-pass:** An ordinal in a seam ("throw on the Nth read") is a standing claim about
  which calls run, and it is falsified by any short-circuit on the very path the row mandates.
  Anchor on a structural event — *"the first read after X failed"* — which survives reordering and
  is strictly stronger.
- **P0-docs-pass:** Editing a `Done` spec means editing inside other people's gates. Locate every
  digested range **before** the first edit (`awk` the extraction ranges out of the verification
  block and hash them), then re-run the id/vocabulary sweeps after. Two of my three drafting
  choices in this pass — a markdown table, and a `####` heading — would have failed V-30, and
  running it is what told me, not reading it.
- **P0-docs-pass:** Writing `NOT <ratification-token>` to mark something unsigned re-creates
  exactly the false positive the repo already recorded: a bare grep for the token now matches the
  paragraph that says the token is absent. Spell the negative in words.
- **P0-docs-pass:** When a task hands you a figure ("three rounds running", "five instances in one
  day"), grep for it before writing it into an ADR. Two of this pass's three cited tallies did not
  reproduce as stated, and one of the corrections — that the rounds were *non*-consecutive — turned
  out to be the strongest argument in the amendment, because it explains why the existing
  circuit-breaker never fired.

- **P0-docs-pass:** A lesson can be cited, believed, and still only half-applied — I quoted #115's
  TAP rule while implementing one of its two clauses. **When a lesson has two parts, check both
  parts against the code, not against your memory of having applied it.**
- **P0-docs-pass:** Parsed output and process exit are two witnesses and they can disagree.
  Trusting the parse alone means a dead reporter reads as a clean run. **Assert both, and say which
  one you believe when they conflict.**
- **P0-docs-pass:** The last hand-typed figure in a document is the one most likely to drift,
  because everything around it has already been mechanised and nobody re-reads it. Deriving
  `COUNTS` cost four lines and removed the final transcription this spec contained.
- **P0-docs-pass:** Reporting a change accurately sometimes means saying "this was already safe."
  I could have banked the directive exclusion as a fix; measuring first showed the anchor already
  carried it. **The record is worth more than the credit.**

- WP-attended-alert-acknowledgement: when a Deliverables table adds a new basename to a shared constant like `A5_PRIVATE_FILE_BASENAMES`, check for existing tests that assert that constant's *exact* membership (`deepEqual`) rather than just "is a member of" — those are the ones a correct, spec-compliant change will break, and if the spec doesn't list them as Deliverables, the implementer is stuck reporting a spec bug instead of fixing forward.
- WP-attended-alert-acknowledgement: this WP's local dev machine already had the exact real-world scenario the spec's Context section describes (120 live `--catch-up` alert records, 2 distinct reasons) — running `node bin/wienerdog.js alerts` (V11) against the real `~/.wienerdog` core was a genuinely useful extra confidence check beyond the isolated unit tests, worth doing whenever a WP's Context section cites the maintainer's own install as a concrete example.
- WP-attended-alert-acknowledgement: the spec's Exact-contracts block gives a fully worked literal example for `wienerdog alerts` (list) but only prose ("prints the unacknowledged groups in the format above") for `wienerdog alerts ack`'s pre-prompt listing — worth a literal block in a future spec revision so implementers don't have to infer whether the list command's header/footer lines carry over.
- WP-attended-alert-acknowledgement: grouping/aggregation code over an append-only log should never assume the log's on-disk order equals sort order by timestamp — file-write order and `at`-sort order coincide in the common case and silently diverge the moment any record arrives out of order (clock skew, backfill, concurrent writers). Any min/max tracked while folding such a log needs an explicit comparison (`if (a.at < cur.first) …`), not an assignment on every iteration; a working test suite built entirely from monotonically-increasing fixtures won't catch this, so it's worth a deliberately out-of-order fixture whenever a spec introduces a new fold over `alerts.jsonl`-shaped data.

- WP-147: a Ready spec's snapshot of code it owns is the highest-risk staleness — "the rest is unchanged" plus a rotted quote is an instruction to regress a security fix; replace the phrase with a byte-for-byte region table.
- WP-147: "untrusted input" plus `typeof x === 'string'` is not validation when the value is byte-matched and the match deleted — bound the vocabulary to what the producer can emit, and validate multi-field metadata as a pair.
- WP-147: a "first write wins" rule assumes the artifact is only created once; any hand-editable artifact has a delete-and-recreate lifecycle, and that is where such rules break. When two fields in one helper need different update rules, a per-field/per-branch matrix makes a missing cell visible instead of arguable.
- WP-147: an absence-only gate is one spelling wide — assert presence of the operative literals too, and prove the gate against a different evasion than the one you first imagined.
- WP-147: a spec whose deliverables span two sides of one contract needs at least one V-step that implements both sides and runs the shipped suite — seven rounds of one-side-at-a-time verification left a flipped shipped assertion latent while eight gates reported green.
- WP-147: an evidence table needs its reachability stated, not just its cells filled — a row blended two constructions for three rounds because nothing said what shapes the input could take; derive fixture inputs from the contract instead of asserting them.
- WP-151: an executable claim can be uncompilable rather than merely outdated (`logFile` never existed); grep the identifiers a contract names before trusting it.
- WP-151: reading an attacker-controlled property twice is a vulnerability even when the first read is validated — bind once, validate once, interpolate the binding.
- WP-151: when a change adds a new way into an existing code path, verify the path it lands in, not only the gate that opens it — a truth table over one half is how a TypeError shipped past two reviewers.
- WP-151: when a fix introduces a regression (loud crash → silent success), the fix's own WP owes the repair; routing it ships a knowing regression.
- WP-151: a state flag named for intent (`writableEnded`) may fire at the call, not the completion — measure before using one as a settled-check; and a probe that settles is not evidence until it uses the production ordering.
- WP-153: an architect reaching an owner's answer is not the owner answering; "reverting is one line" quietly inverts an opt-in into an opt-out.
- WP-153: "X is a value only we ever wrote" is never true of anything read from an untrusted file — the sentence itself is the tell.
- WP-153: inserting a row into a canonical table is never a local edit — every fixture, mirror, and precondition keyed to the old row set needs re-derivation; a Preconditions column converts invisible reachability dependencies into declared ones.
- WP-153: when a spec claims a migration, execute the helper that would perform it — `recordOnce`'s no-op falsified a sentence that read plausibly for two weeks.
- WP-adr-0028: a gate set that describes only one of a WP's correct states cannot close honestly — when a WP has a terminal state its own criteria contradict, name the states rather than waiving a criterion.
- WP-adr-0028: line numbers inside an appendable region are structurally unstable (they drifted within a single commit); identify content-anchored criteria by content, and let a classified worked example BE the roster instead of asserting exhaustiveness that was never checked against real output.
- WP-adr-0028: "X has an owner" and "X is fixed" are different claims — conflating them is how a live production hazard got recorded as discharged; a correction is not done until you grep for its claim, not its location.
- Process: a declared threat model is what terminates an adversarial review loop — but a declared residual only stops re-raises once it has a test that pins its size.
- Process: dispatch-time re-verification caught both Ready specs stale before any implementer saw them (one would have regressed a security fix); the rule earned its keep on its second outing.
- Process: verifier findings are a starting point, not a boundary — three consecutive rounds, the architect or a reviewer found one more instance the reporter missed by re-running everything themselves.

- WP-help-text-safety-gates: locating the target line by byte-exact text rather than line number paid off trivially here, but the spec's explicit warning about the second `safety` mention (dispatch table at :65) is the kind of disambiguation that prevents a wrong one-line edit.
- WP-help-text-safety-gates: the V4 alignment probe (awk RLENGTH over the Commands block) is a cheap, reusable idiom for guarding fixed-column help text without a golden file.

- WP-vision-gate-status-destale: spec-provided byte-exact removal/insertion blocks plus a pre-verified V1/V2 baseline (22/51/45) made the de-stale mechanical — the baseline matching on first run confirmed the tree state before any edit.
- WP-vision-gate-status-destale: the "no live per-gate verdicts anywhere except THREAT-MODEL T0; everything else points at `wienerdog safety`" rule is a good staleness firewall for any future prose that mentions gate status.

- WP-147: type-gating an untrusted, self-healing field is a foot-gun — `validateEntry`'s reject-on-bad-type runs *before* the reverser's degrade-to-legacy path, so a `'string'` rule turned "malformed metadata → conservative strip" into "malformed metadata → block left installed". The allowlist inside the reverser is the real guard; the schema must stay permissive so the entry reaches it.
- WP-147: an honest-use regression can masquerade as an in-scope "residual" — Table N row 6 (relocated block, recorded `sepBefore='\n\n'`) collapsed a user blank line with no forgery at all, and was worse than the shipped code it replaced. A declared bound only covers the threat it is scoped to (forgery); honest-path corruption is a defect, not a residual.
- WP-147: a two-conjunct safety predicate needs a red-first test in **both** directions — dropping conjunct 1 fails one row, replacing conjunct 2 with conjunct 1 fails a *different* row; a single red test would have let either wrong simplification through.
- WP-147: the worktree sandbox refuses compound bash (command substitution + loops) inline; write the spec's V-gates verbatim into a script file and run `bash script.sh`.
- WP-147: patching relocation permutations one at a time never terminates (three gate rounds, three permutations). The durable move is to declare the boundary *once, generally* — separate "worse than base = defect, fix it" from "equal to base = residual, pin it" — and pin the residual with a NOT-red-first `=base` test so the next report resolves against a committed assertion instead of re-opening the WP.
- WP-147: the sandbox also refuses `git commit -m` with a multi-line body containing `\n` literals; commit with `git commit -F <file>` from the scratchpad.

- WP-151: `node:test`'s `{ timeout }` marks a hung test **cancelled**, not
  failed — `fail 0, cancelled 2` is what a red hang looks like; grep for
  cancelled too when hunting red evidence.
- WP-151: an absence-check verification (V9's `writableEnded` grep) can be
  tripped by your own explanatory comment — word comments so the forbidden
  token stays greppably absent.
- WP-151: a child's spawn-ENOENT message is Node-authored; to plant a marker
  in a non-Wienerdog failure without adding a spawn seam, put the marker in
  the nonexistent command path itself.

- WP-153: Dispatch-time re-verification paid off — WP-147 shifted every `manifest.js`
  anchor after ~:205 by ~53 lines; implementing by CONTENT (not the spec's stale
  numbers) was essential. All code shapes still matched, so the design held.
- WP-153: A gate at the enclosing loop can silently shadow a branch a spec assumes
  is reachable. `reverse()`'s `withinAllowedRoot` follows the link via realpath, so
  a dangling-link fixture is preserved before the reverser runs — the spec's T4
  "reverse() unlinks" claim was untestable as written. Verify reachability
  empirically before writing a fixture, not just the branch logic.
- WP-153: The Deliverables table said the arm's "only change" is the extra
  `skillsRoots` arg, but honestly testing the lexical fallback required one more
  in-file change (exporting `reverseSymlink`). When a required test can only be
  written against a non-exported internal, the export is part of the deliverable —
  flag it rather than skip the test.

- WP-scheduler-register-replaces-loaded-record: `WIENERDOG_LOADER_NOOP` (used
  by ~15 test files across the suite to neutralize the real OS scheduler for
  subprocess-driven CLI tests) is fundamentally incompatible with any
  ADR-0037-style live-readback postcondition — it answers every spawn with a
  blind `{status:0}`, never a matching `stdout`. Any future WP touching
  register-path verification should budget for this collision up front rather
  than discovering it at `npm test` time.
- WP-scheduler-register-replaces-loaded-record: when a spec's own worked test
  fixtures use a "malformed" flag to simulate an unclosed block (e.g. `arguments
  = {` never closed), a parser without depth-tracking will happily swallow a
  LATER block's closing brace as if it were the missing one — a synthetic
  fixture must TRUNCATE the stdout entirely at the malformed point, not just
  leave the block open while continuing to emit more text after it.
- WP-scheduler-register-replaces-loaded-record: AC6's "exactly four existing
  assertions change" underclaimed by one — `repointSchedules after add is a
  no-op`'s own `calls.length` assertion is a second, structurally identical
  casualty of the same Table A behavior change (a verified skip now costs a
  readback even when unchanged) that AC5(iii) already documents for the
  `:389-397` sibling test. Worth a spec pass to enumerate it explicitly next
  time this chain gets revised.
- WP-scheduler-register-replaces-loaded-record: a scripted mutation-testing
  harness (apply one exact-text patch, run the named test via
  `--test-name-pattern`, assert red, `git checkout --` to revert) made
  demonstrating ~40 Table B rows tractable in one session, and caught three
  real fixture bugs of my own that a purely manual "looks right" read would
  have missed — recommend this pattern for future WPs with large mutation
  matrices.

- WP-scheduler-node-path-durability: `entryNodePath`'s never-throw contract
  (whole body in one `try {...} catch { return execPath; }`) means an
  injected `realpath` that calls `assert.fail()` when reached has its
  exception silently swallowed — the return value doesn't change, so a
  naive "assert equal to the unchanged fixture" test cannot detect the
  mutation. Detecting "was the filesystem seam reached at all" requires an
  out-of-band flag set as a side effect before the throw, checked after the
  call returns, not the throw itself.
- WP-scheduler-node-path-durability: a spec measured and tested against a
  real Homebrew macOS dev machine can bake host-specific assumptions into
  sibling test files that then become "must pass unmodified" NOT-deliverable
  constraints — assumptions that this exact kind of change (an ENTRY path
  now correctly differing from `process.execPath` on that same host shape)
  legitimately breaks. Worth a spec-authoring note next time: state whether
  a NOT-deliverable file's assertions were actually re-run post-implementation
  on the measured host, or only checked against unmodified `main`.
- WP-scheduler-node-path-durability: `git diff origin/main...HEAD` is empty
  until something is actually committed to the branch — V5/V6's diff-based
  commands need to run AFTER the commit, not against a dirty worktree, or
  they silently report "no changes" instead of the real diff.

- WP-sanitize-project-display-names: Run the repo's own lint config (`npm run lint`), never bare npx defaults — the wrong config both hid six real errors for eight rounds (an unescaped `|` silently truncates markdown table cells) and invented six false ones on a clean file.
- WP-sanitize-project-display-names: When the input space is finite, sweep it — the full 1,114,112-code-point sweep runs in 827 ms; a sampled corpus hid a selective-rejection bug that only the full range caught (twice: in spec review, and again as mutation M9).
- M0-process: Extract fenced blocks by script and verify the bytes (sha256, `od -c`) — never retype: editor and shell channels corrupt `\u` escapes, em dashes and indents, and a `\|` in a markdown table cell reaches `grep -E` as a literal pipe. Three measured incidents.
- M0-process: A number may wear a "measured" label only if it comes from running the document's own command, now — a computed or remembered number survives every check except the re-run (a 44-line threshold miss shipped that way).
- WP-daily-summary-per-line-framing: Count diff lines with `git diff --numstat`, never by `+`/`-` prefixes — a markdown bullet edit renders as `+- …`/`-- …` and prefix-parsing miscounts or zeroes it.
- WP-daily-summary-per-line-framing: When round records and commit messages cite SHAs, sync the branch by merge, not rebase — rebase falsifies the record it tidies.
- WP-sanitize-project-display-names: PR CI runs on `refs/pull/N/merge` (the merged tree) — a branch lagging main needs no rebase for its green to be current.
- M0-process: A measured failure plus a measured workaround still names no cause — an A-fails/B-works pair can be confounded (it was: a stale codex broker, not the git worktree). Isolate the variable, or write "observed, cause unknown" — never land a causal claim on correlation.
- M0-process: A subagent's end-of-turn narration ("round N is still running") is text, not state — when its message arrives, the agent has stopped; trust the harness status and the transcript mtime, never the narration.
- M0-process: Verifying the evidence an agent hands you is not verifying its claim — read the artifact on the tree (the cell, the file), not the exhibit the agent quotes; a reported edit once verified this way had never been made.
- WP-snapshot-read-path-hardening: this shell's `grep` is a ugrep shim with `-I`, and `tests/unit/vault-snapshot.test.js` is detected as binary (raw high bytes in fixtures), so a plain grep silently skips it. A review round concluded "no test covers this" from that false negative. After a surprisingly empty grep, re-run with `command grep -a` before building on the absence.
- WP-snapshot-read-path-hardening: two of the loop's 29 findings were themselves wrong. The runbook's "the orchestrator spot-checks citations before anyone acts on a finding" caught both — it is not a formality.
- WP-snapshot-read-path-hardening: a verification grep that forbids an identifier the spec's own comments are required to name will punish the correct answer. Two such greps went into the first draft; the fix was deletion, not tuning.
- WP-snapshot-read-path-hardening: a memory bound could not be pinned as a METRIC across three rounds (aggregate or per-allocation? view or backing store? does the gate's decoded string count?), and converged in one round as a MECHANISM — allocate at the bound, hand onward a copy. When a contract family reproduces round after round, check whether the spec has drifted below its own altitude.
- WP-snapshot-read-path-hardening: do not chain `npm run lint && git commit` in one shell line — the chain swallows the red and the commit lands anyway. Happened here; amended.
- WP-snapshot-read-path-hardening: the ADR-0031 extraction (Table C) closed two recurring families and then introduced two self-contradictions of its own. The measured 0.5-0.9 injected-defect rate applies to a freshly extracted table too, so an extraction still owes a round.
- WP-snapshot-read-path-hardening: a `node:test` timeout cannot bound a synchronously-blocking call (`openSync` on a FIFO) — the blocked event loop never fires the timer, so a regression hangs CI instead of going red. Run the dangerous call in a child process via `execFileSync` with a timeout: a hang becomes a failure.
- WP-snapshot-read-path-hardening: the honest form of a mutation check runs the mutation against the test file before AND after the fix — "red now" alone does not prove the fix fixes; only the green-before/red-after pair does.
- WP-snapshot-read-path-hardening: a wrong mutation gives false comfort — a `continue` inside a `try` still runs the `finally`, so a mutation meant to "prove" a descriptor leak never leaked, and the observed failures came from elsewhere. Verify that the mutation breaks what you intend it to break.
- WP-snapshot-read-path-hardening: a record that claims "byte-unchanged" is falsified by any convenience abbreviation made while transcribing — eight shortened paths did it here; restored. For a file meant as evidence, "almost verbatim" is not a category.
- `WP-frontmatter-recognition-failopen`: **zero findings is not readiness if
  the review's focus never went there.** The digest half was called "clean
  across three rounds" and used as the argument for shipping it; the first
  round that actually attacked it returned two design-level findings. A
  finding count only means something over surface the reviewer was pointed
  at — say which surface a clean round covered, never just that it was clean.
- `WP-frontmatter-recognition-failopen`: a claim about a specific code path
  must be measured on *that* path. Six findings across the loop were this one
  defect — a rationale, a banner's visibility, a corpus predicate, a partition
  universal, a normalization order, an invisible-prefix justification.
- `WP-frontmatter-recognition-failopen`: when the same author writes both the
  contract and its proof, the proof inherits the contract's blind spots. Two
  structural answers — per-cell reproduction, then a totality sweep — were each
  defeated by the very blind spot they were built to catch. A property whose
  oracle calls the implementation's own helper is a tautology.
- `WP-frontmatter-recognition-failopen`: a fail-closed guard belongs at the
  decision, not in the view it reads. Emptying a record on `malformed` erased
  the difference between *absent* and *hidden*, and every preservation check
  reads absence as agreement — four detected violations became zero.
- `WP-frontmatter-recognition-failopen`: an enumeration cannot prove a
  partition exhaustive. Three enumerated case lists were each defeated by a
  shape outside the list; only a ruling change — recognition never widens —
  removed the unbounded question instead of answering it again.
- `WP-frontmatter-recognition-failopen`: do not write into the reviewed
  checkout while a review gate is running, logbook files included. Round 7 was
  invalidated by exactly that, and the invariant cannot tell my write from the
  reviewer's.
- `WP-frontmatter-recognition-failopen`: **a test that names a case does not
  necessarily reach it.** Two of this package's assertions named a thing they
  never touched — a fixture that produced no candidate at all, and a byte-cap
  assertion 20% below its ceiling. Both looked like coverage and were green.
  The only reliable check is a mutation that violates the contract: if the
  suite stays green, the assertion is decorative.
- `WP-frontmatter-recognition-failopen`: literal control characters do not
  survive a copy/paste round trip. A probe silently lost its NEL/VT/FF and
  reported a healthy-looking wrong classification. Escapes only, and print the
  code points before asserting anything.
- `WP-frontmatter-recognition-failopen`: `git status --short`'s `RM` is two
  columns — a staged Rename and an unstaged Modify — never one signal. A
  done-flip shipped as a pure rename because the `sed` after `git mv` was
  never staged, and the "verification" grepped the working tree while the
  claim was about the commit. Assert against the artifact the claim is
  about: `git show` / `git diff --cached`, never the file.
- Pipeline (maintainer): in a two-remote checkout `gh` defaults to the
  upstream, which here is PUBLIC — every `gh pr`/`gh issue` call must carry
  `--repo felho/wienerdog`, or a security package's PR opens in a public
  repo. Hit twice (a gate queried upstream's PR by number; a session caught
  it pre-flight before opening).
- Pipeline (maintainer): push local main before opening a PR from a branch
  based on it — an unpushed main commit under a rebased WP branch appears
  in the PR diff and turns the boundary check red (measured on PR #9;
  prevented by a pre-flight check on PR #11).
- `WP-validator-decided-bytes`: **the package's one repeated defect, six times
  over — an assertion that was read, found plausible, and never run.** The
  charter's redaction boundary ("decimal only, cannot" → "hexadecimal only" →
  "no class can be characterized"), AC2's fixture, AC7's idempotence line, and
  a relay `iff`-on-length claim. Every one was written by an actor reasoning
  from a property instead of enumerating the alphabet, and every one was caught
  by the *next* reader running it. The gate works; the writing is what fails.
- `WP-validator-decided-bytes`: **the sixth instance is the dangerous shape —
  it WAS run, against the wrong tree.** A `grep -n fs.appendFileSync` executed
  on the working tree *after* the implementation landed gave `:1388`, which is
  a HEAD line number where the spec's convention is base-tree (`:1355`, the
  diff adds +33). The relay produced it, the architect "confirmed" it on the
  same post-change tree, and the PR gate caught it. Running the wrong tree is
  not better than reading — it is worse, because the command exits 0 and
  returns a number, so nothing looks suspicious.
- `WP-validator-decided-bytes`: **an acceptance criterion is a claim about
  behaviour, so it is a claim to be RUN at the moment it is written.**
  Boilerplate copied from `_TEMPLATE.md` is the highest-risk kind, because
  nobody treats a template line as an assertion. AC7's "second run: zero
  changes" was false for this component from the first draft and survived round
  0b, four adversarial rounds and dispatch-time re-verification — five gates
  that all *read* it. Structural fix worth considering: make round 0b run every
  acceptance criterion that has a runnable form and report its exit status;
  AC2 and AC7 would both have died in round zero instead of at round four and
  implementation.
- `WP-validator-decided-bytes`: **exhaustiveness by syntax class is impossible
  when the two predicates live on different axes.** Redaction is a predicate on
  a literal's *characters* (an unbroken run ≥ 24 over `[A-Za-z0-9+=/]` at
  ≥ 3.5 bits/char); `Number()` acceptance is a predicate on its *syntax*. Proof
  in one measured pair, same syntax class, opposite outcome:
  `10293847561029384756E+12` (3.522 bits) is redacted,
  `102938475610293847561E12` (3.387) is clean. A charter that names classes
  hands a successor a boundary that does not exist — state measured positives
  as evidence and say plainly that the intersection was not enumerated.
- `WP-validator-decided-bytes`: **a "the forbidden design must fail this test"
  criterion is only credible if the forbidden design is COMPILED FROM THE
  SHIPPED SOURCE.** Two asserted-unique string substitutions plus
  `Module.prototype._compile` on the real file give a mutant that cannot
  silently drift; a hand-written one rots into agreement. AC2 spent four design
  rounds vacuous in the weakened "the revision is reverted" form — which both
  designs satisfy — and only the discrimination form (forbidden ADMITS, shipped
  REVERTS, identical bytes) catches it.
- `WP-validator-decided-bytes`: **which malformation rule a fixture uses is a
  security decision, not a stylistic one.** Only an *indented* line both sets
  `malformed` and withholds the field from the view; a duplicate key keeps the
  first value visible, so the pre-existing raise-only check does the rejecting
  and the guard under test is never exercised.
- `WP-validator-decided-bytes`: **put the non-vacuity assertion inside the
  fixture loop, next to the bytes.** Asserting per case that `parse` reports
  malformed AND that the view still shows floor-passing fields is what proves
  the guard did the rejecting rather than a weak floor — and it survives a
  future edit to the fixture in a way a prose comment does not.
- `WP-validator-decided-bytes`: **write a revert reason from the reverted
  path's point of view, not the decision's.** Two of five guarded sites parse
  bytes that are not the reverted file's — the ledger site parses the sibling
  `SKILL.md`, the revision guard parses HEAD. A reason written from the
  decision would send the user to repair a file that is fine. This only becomes
  visible when you place the check.
- `WP-validator-decided-bytes`: **run a gate from a script, not an inline shell
  one-liner** — the runbook's own rule, reproduced by the session relaying it.
  `"$MAIN:src/core/dre…"` in zsh is a `:s` substitution *modifier*, so the path
  git was asked for was silently rewritten and the dispatch gate reported
  **12 false STALEs** on a spec that was fine. A false red is not a harmless
  false alarm: believed, it blocks a dispatch.
- `WP-validator-decided-bytes` (pipeline): **`gh` resolves to the wrong remote
  in this checkout.** There are two — `origin` = `felho/wienerdog` (where the
  work and every PR lives) and `upstream` = `wienerdog-ai/wienerdog`. Bare
  `gh pr create` picked upstream and failed with "No commits between main
  and …", which reads like a branch problem. Pass `--repo felho/wienerdog` on
  every `gh` call; a "no such PR" answer against the other repo looks equally
  plausible.
- `WP-validator-decided-bytes` (pipeline): **verify a done-flip on the STAGED
  diff, with rename detection on.** `c04cd08` on the predecessor landed as a
  pure rename, 0 insertions / 0 deletions, because `git mv` staged the move
  while the status `sed` was never `git add`-ed and the working tree was
  checked instead. `git diff --cached --find-renames --numstat` must show
  `1  1`, not `0  0`.
- `WP-validator-decided-bytes` (design loop): **three narrowings in four
  rounds, and no round was closed by a better mechanism.** Contract went
  C1+C2+C3 → C1+C2 → C1; verification steps 4 → 3 → 2. The predecessor's record
  predicted exactly this. Corollary that paid off: pin the fallback *before*
  the round, and let it be a floor of shrinkage rather than a ceiling — round 1
  falsified the first fallback's premise (it aimed at one finding; the real
  failure was six), and going further than it pointed was right.
- `WP-validator-decided-bytes` (discovered, not fixed): **the dream is not
  idempotent and never was.** Step 4's enforcement append
  (`src/core/dream/validate.js:1355` at base) is unconditional — it writes
  `- none` when nothing was reverted — so every `validateAndCommit` run appends
  a section and makes a commit, growing the day's report with duplicate empty
  sections. Measured identically before and after the change. Every nightly
  no-op run commits.
- `WP-temp-root-wrapper` (spec loop): **the Mirrored Surface Checklist is a
  thing to RUN after every edit wave, not a section to author.** Two stale
  mirrors survived fix waves until the walk actually ran; the sharpened form
  that finally produced a clean walk: when a wave CREATES a surface (splits a
  criterion, adds a step), re-derive the governing invariant — every new step
  has a deliberate-red, every split covers the whole input space — instead of
  only re-reading the mirrors that already existed.
- `WP-temp-root-wrapper`: **`find -mtime +1` means "older than 48 hours", not
  24** — age is floored to whole 24h units before the `+1` comparison. A
  minute-exact cutoff needs `-mmin +1440`. Measured during the host sweep:
  the `-mtime` pass deleted 16,923 entries where the 24h intent covered 58,259.
- `WP-temp-root-wrapper`: **"the file contains zero cleanup calls" is a false-
  negative leak heuristic.** Audit per-file deficit (mkdtempSync count minus
  removal-call count) instead: the worst offender (50 mkdtempSync, 1 rmSync —
  aimed at a file, not the roots) passes the binary filter and leaks all 50.
- `WP-temp-root-wrapper`: **on a multi-session machine, any verification that
  counts entries in the shared `$TMPDIR` is flaky by construction** (~30k new
  `wd-*` dirs/day here, one every few seconds). Counted asserts must run under
  a pre-redirected private temp root; false greens (leak+delete cancelling)
  are possible, not just false reds.
- `WP-temp-root-wrapper`: **`VAR= cmd` sets an empty string, not unset** — an
  env-purity assert needs `env -u VAR cmd`, and the child must discriminate
  with `'VAR' in process.env`, not truthiness. The empty-string form passed
  green against a wrapper that injected `''`.
- `WP-temp-root-wrapper`: **macOS `mktemp -d` does not honor an exported
  `TMPDIR`** — it creates siblings in the original ambient directory, while
  Node's `os.tmpdir()` follows the export. Shell scratch dirs and Node temp
  are two separate worlds in one verification block.
- `WP-temp-root-wrapper`: **`set -e` alone does not fail-close a verification
  block containing pipes** — a failing producer piped into `tail` exits 0
  without `pipefail`. Measured: with `set -e` only, the block continued past a
  failing wrapper and exited 0; `set -eo pipefail` is load-bearing.
- `WP-temp-root-wrapper` (close-out): **when a spec claims a coverage universal
  ("all four rows"), the exception set belongs in that criterion, not in the
  canonical contract table.** Table A decides what the code must do; it does not
  decide what is testable. Two exit-status rows here have no CI-portable case —
  both need a genuinely unremovable directory (`chflags uchg` on macOS,
  root-only `chattr +i` on Linux), so a case built for either of CI's two
  runners fails on the other. Recording that in Table A would have made the
  canonical table own a fact it cannot arbitrate.
- `WP-temp-root-wrapper` (close-out): **a guard test that pins `package.json`
  byte-exact is a mirrored surface and belongs on the Mirrored Surface
  Checklist.** Executable mirrors are structurally easy to miss at authoring
  time because they do not exist yet — they arrive with the implementation, so
  registering them is inherently a post-merge move. Here a seventh test-running
  npm script moves *three* surfaces, not the two the checklist listed.
- `WP-temp-root-wrapper` (close-out): corollary to the existing
  `WP-validator-decided-bytes` done-flip rule — because the flip's integrity
  check is read off the staged, rename-detected diff (`1 1`, not `0 0`), it is
  only readable when the flip commit contains **nothing but the status line**.
  So post-merge spec amendments belong in a *separate commit on the same
  branch*, not folded into the flip. Two prior commits in this repo folded them
  together; nothing forbids it, but it costs the check.
- `WP-temp-root-wrapper` (pipeline): **a subagent inherits the parent session's
  worktree pin, and the pin governs Bash but not Read.** A worktree created
  under `<shared-checkout>/.claude/worktrees/` is refused for a subagent's every
  Bash call ("resolved to the shared checkout") while `Read` on the same paths
  works — which reads like a permissions puzzle rather than a pin. Worse,
  `EnterWorktree` **reports success** and Bash still refuses. A whole implementer
  session was lost to this. Create implementer worktrees as **siblings** of the
  repo root, tell the agent never to call `EnterWorktree`, and to prefix every
  Bash call with `cd <abs worktree path> &&` (the shell cwd resets between
  calls).
- `WP-temp-root-wrapper` (pipeline): **reproduce a review finding before
  accepting it — the first attempt failing is not an acquittal.** The external
  gate reported that the failed-teardown diagnostic follows symlinks out of the
  run root. The first reproduction did *not* trigger it, because `rmSync`
  unlinks the escaping symlink before the diagnostic reaches it; the bug needs
  the *link itself* to survive removal (an immutable run root). Stopping at
  "not reproducible" would have shipped a real containment bug.
- `WP-temp-root-wrapper` (post-merge, operational): **a wrapped run leaves ZERO
  top-level `wd-*` residue, which turns the temp directory into an attribution
  tool.** Any surviving top-level `wd-*` block proves a wrapper-less checkout
  ran the suite, and the absence of `wd-tmpguard-` / `wd-testrun-` prefixes in a
  burst rules out a post-fix producer. Measured on merge evening: two discrete
  bursts (1,670 and 1,878 dirs) that nobody believed existed, the second with a
  different prefix profile — i.e. a different test set — than the canonical
  baseline.
- `WP-temp-root-wrapper` (post-merge, operational): **the fix is per-checkout.**
  Right after the merge, 9 of the 10 checkouts on the maintainer's machine (all
  the `wp/*` worktrees, the war-room worktree, and the shared main checkout)
  still lacked `tests/with-temp-root.js` and kept leaking ~1,670 directories per
  `npm test`. A merged leak fix does not stop the leak until every live worktree
  carries it — budget for that when judging whether a sweep "worked".
- Pipeline (maintainer, Actions-quota condition): when GitHub Actions minutes
  are exhausted, jobs fail in 2–4 s with **zero steps executed** and no logs, on
  every workflow and every branch including docs-only pushes to `main` — a red
  that says nothing about the diff. Substitute by running the blocked jobs
  locally and posting them as `local-ci/*` commit statuses on the head SHA, plus
  one PR comment naming what has **no** local substitute. Never substitute the
  smoke job: `scripts/smoke-install.sh` reaches the real user-global
  launchd/systemd label domain, which its throwaway `HOME` does not scope, and
  running it locally on 2026-08-20 booted out the live `ai.wienerdog.dream` and
  `ai.wienerdog.catchup` agents.
- **WP-dream-baseline-delta-primitive:** `--test-name-pattern` matches test NAMES, not
  file names. A spec verification step written as `npm test -- --test-name-pattern
  "<file-slug>"` is VACUOUS — exit 0 with a broken assertion in the file — unless the
  tests carry the `<file-slug>: ` name prefix this repo already uses everywhere. Prove
  every new verification gate red before believing its green.
- **WP-dream-baseline-delta-primitive:** a `grep`-based "this file must not spawn"
  gate cannot distinguish a comment from a call, so the module cannot NAME the module
  it must not require. Enumerating every `require(...)` in the source and pinning the
  whole set is strictly stronger and has no such blind spot.
- **WP-dream-baseline-delta-primitive:** a spec obligation that names a specific
  production function must also guarantee the implementer can REACH it. Naming a
  non-exported function while forbidding edits to its file forces a choice between a
  drifting copy and source extraction — decide it in the spec, not in the PR.
- **WP-dream-baseline-delta-primitive:** "my diff is a conservative SUPERSET of git's"
  is the kind of claim that feels safe and is not. Where duplicate lines admit two
  equally minimal alignments, neither answer contains the other — git's is not maximal
  either — so no single alignment can promise the superset. Counterexample: before
  `"a\na\n"`, after `"b\na\na\nb\na\n"` — git `[1,4,5]`, prefix/suffix trim
  `[1,2,3,4]`. State the property you can PROVE (here: every line whose content is
  absent from the baseline is reported) and prove it exhaustively; a conservatism claim
  that was never searched for a counterexample is a fail-open hole wearing a
  fail-closed label.
- **WP-dream-baseline-delta-primitive:** an oracle whose failure mode is
  indistinguishable from one of its success values is the same defect class as a gate
  that cannot go red. `binary` was derived from git's stdout, and a git that never ran
  yields empty stdout — which reads as "text". Assert that the oracle RAN, not only
  what it said.
- **WP-dream-baseline-delta-primitive:** converting a PATH-selected executable to an
  absolute realpath does not remove the PATH-selection channel — it only moves it
  earlier. If a repo already has a pinning discipline (here `verifyExecutable`'s owner
  and ancestor-writability checks), a test that invents a weaker one is claiming
  parity it does not have.
- **WP-dream-baseline-delta-primitive:** in zsh an unquoted `$VAR` holding newlines is
  ONE argument, not many. `node scripts/boundary-check.js <spec> $CHANGED` reports a
  bogus boundary violation for that reason alone. Quote or use `xargs`.
- **WP-dream-baseline-delta-primitive:** structural verification of an executable is not
  identity pinning. Checking that a PATH candidate is a regular file, owned by you, in a
  non-world-writable directory says it is ACCEPTABLE, never that it is the INTENDED
  installation — and a shim in a user-owned `0700` directory satisfies all of it. If PATH
  order can still decide, the channel is open. Resolve from fixed locations and report
  when you could not.
- **WP-dream-baseline-delta-primitive:** guarding one of two subprocesses is guarding
  neither. A failed process's empty stdout reads as a legitimate "nothing here" for
  whichever inputs legitimately produce nothing, so the vacuous cases pass first and
  loudest.
- **WP-dream-baseline-delta-primitive:** POSIX makes a trailing separator force directory
  resolution, so `lstat(p)` and `lstat(p + '/')` disagree about whether `p` is a symlink.
  Any refusal built on `lstat` must normalise first — `path.resolve` is the whole fix,
  and without it the refusal is false for one character of caller input.
- **WP-dream-baseline-delta-primitive:** when a fix round corrects a MIRROR, check the
  direction. Correcting the mirror and leaving the canonical table makes the code more
  accurate than the contract that owns it — a registered-mirror checklist detects the
  drift but does not say which way the edit should flow.
- **WP-dream-baseline-delta-primitive:** citing a measurement you inherited as one you
  made is the same defect as citing evidence that does not reach its claim. Either
  re-measure it or attribute it; "measured" is a claim about who looked.


- `WP-dream-workspace-retarget`: a spec that renames a public option must list
  its callers in Deliverables, or "npm test passes" and "touch ONLY these"
  exclude each other.
- `WP-dream-workspace-retarget`: "construct the child env from an allowlist"
  collides with fixtures steered through the ambient env. The fix is not an env
  name in `src/` — that is a WP-155-class production seam — but a control file
  the installing test writes beside the pinned command, with the fixture's own
  argv keeping precedence so a self-re-spawn cannot inherit a spawning mode.
- `WP-dream-workspace-retarget`: a test fake that writes to `process.cwd()`
  pollutes the repo — the run-evidence `--version` probe spawns without a `cwd`
  and inherits the runner's.
- `WP-dream-workspace-retarget`: `git checkout -- <file>` to undo a scripted
  red-test mutation reverts to HEAD, not to the pre-mutation working tree, and
  silently discarded a round of uncommitted edits. Back up the file instead.
- `WP-dream-workspace-retarget`: when a test's own comment says "the invariant is
  asserted on the mechanism instead", check that it actually asserts the
  mechanism. Mine did not, and the name of the test hid it for a whole round.
- `WP-dream-workspace-retarget`: "is this path inside that directory" is a much
  harder question than it looks, and eleven review rounds went into it. Every
  string answer is wrong: substring fires on `~/wienerdog-backup` beside
  `~/wienerdog` and misses `~/Notes`; splitting on `:` breaks on a legal POSIX
  filename; case-folding refuses every dream on a case-SENSITIVE filesystem;
  and `path.resolve`/`fs.realpathSync` both collapse `..` before a symlink, which
  leaks in one direction and refuses a safe child in the other. What works is
  kernel-faithful resolution plus `(dev, ino)` — let the filesystem answer what
  counts as the same place.
- `WP-dream-workspace-retarget`: "it can only over-match, which is the fail-safe
  direction" is not a safety argument. Over-refusing a gate the product must
  pass is the product not running — the same severity as the leak it was meant
  to prevent, and twice here it WAS the more damaging failure.
- `WP-dream-workspace-retarget`: a refusal must cost the user nothing. A gate
  that validates after `mkdirPrivate` has already chmodded the user's vault, and
  a refusal path that deletes recursively destroys exactly what it refused to
  protect.
- `WP-dream-workspace-retarget`: asking a review gate to classify by
  REACHABILITY — "what supported workflow produces this shape?" — is what ended
  an eleven-round loop. It did not lower the bar: the same round the gate
  accepted one shape as unreachable, it found a genuinely reachable blocker.

- quarantine-surface: the gptsol reviewer emitted Hungarian finding bodies when the orchestrating session ran in Hungarian — pin "Respond in English" in every dispatch (recurred once with a Claude architect agent's report; file contents stayed English).
- quarantine-surface: restate owner rulings WITH their carved exceptions in reviewer scope text — round 4's unrecognized-reason finding was manufactured entirely by an imprecise ruling statement.
- quarantine-surface: mirror sweeps need an explicit file list including the ADR, and must run the whole-set grep, never only the reviewer's cited lines (revision 7 found a fifth site the four citations missed).
- quarantine-surface: summary prose that RESTATES a contract breeds recurring findings; rewriting summaries to DEFER to one canonical row killed the class (rounds 5-6).
- quarantine-surface: the same-kind escalation rule paid off twice — the design answer (commit-time reconciliation; dropping the run log) was simpler than the accumulating patches it replaced.
- quarantine-surface: grep-based mirror walks are blind to intra-cell falsification and vocabulary-shifted restatement — the PR-gate reviewer must read whole cells (wd-reviewer's class diagnosis on PR #33).

- WP-digest-line-cap-raise: a spec's inline test snippet is a measurement too — this one asserted `> 200` lines against a fixture that renders 199 on the current base; re-run inline snippets against the dispatch base before trusting their literals.
- WP-digest-line-cap-raise: when a spec prescribes rescaling a fixture, sweep the WHOLE test for measured figures its comments carry — this one had two byte figures and the spec's exact-edit list caught only one; the AC's "comment matches measurement" rule is the better guide than the edit list.
- WP-digest-line-cap-raise: Definition-of-done items can contradict the Deliverables table (the spec-status flip here); the table plus CLAUDE.md's CI rule is the binding boundary — resolve in the PR body, not by touching unlisted files.
- WP-hook-doctor-inspection-read-hardening: zsh does not word-split unquoted `$VAR` — an `env $ENVV cmd` measurement harness silently ran against the wrong HOME and produced plausible-looking numbers; command substitution `env $(…)` splits and worked. Verify a measurement's env reached the child before believing the number.
- WP-hook-doctor-inspection-read-hardening: whole-process peak RSS and forced-GC heap deltas are different quantities on line-splitting workloads — a bounded live set can still show a peak ~35% above the pipeline-delta bound. A constrained-heap run (`--max-old-space-size`) is the cheap corroboration that the extra is slack, not growth.
- WP-hook-doctor-inspection-read-hardening: run Linux-side containers as a non-root user (`docker run -u node`) or every chmod-based EACCES fixture silently stops testing what it claims to test.
- WP-hook-doctor-inspection-read-hardening: a `node`-wrapper-in-PATH is a deterministic way to stand inside a bash-to-node TOCTOU window; races in specs need not stay unfixtured.
- WP-hook-doctor-inspection-read-hardening: CORRECTION (2026-08-31, wd-reviewer adjudication on PR #58) to the `--max-old-space-size` bullet above — that flag caps V8 old space, NOT RSS: RSS stayed ~157 MB under `--max-old-space-size=96`, so it corroborates much less than it reads. The load-bearing instrument for a retained-memory bound is the forced-GC retained-set delta (`--expose-gc`, gc, RSS, run, gc, RSS), and an acceptance criterion must use the SAME instrument as the bound it asserts — AC8 used whole-process peak against a retained-set bound and was non-discriminating: the pre-change base already exceeded it.

- WP-dream-promote-in-workspace: **Enumerating the BAD is unclosable when the grammar isn't ours; enumerating our OWN GOOD is closable.** Two guard directions died by measurement — classifying git's verb (defeated by `--attr-source`, a value-consuming global option added in 2.40) and identifying the target index (defeated by `read-tree --index-output`, a *subcommand* flag no global-option replay reaches). Default-deny over the run's own pinned call set closed both, because that set is ours to enumerate.
- WP-dream-promote-in-workspace: **Separate FORM insufficiency from a PREDICATE defect before deciding whether a loop reopens.** Form insufficiency means the deciding facts never reach the observation point (a git hook — it never exists in argv). A predicate defect means the facts are at the seam and the question is wrong. Only the first is a design question; conflating them either stops a fixable round or iterates an unfixable one.
- WP-dream-promote-in-workspace: **Prove a mutation was APPLIED before believing its result.** Shell escaping silently mangled injected code and three "greens" were unapplied mutations. Every cell now greps its own marker and prints the injected line before the test runs.
- WP-dream-promote-in-workspace: **A "before" state must be FAITHFUL or its red is fake.** Reverting a predicate without also restoring the exemption arm it shipped with produced a RED from the package's own legitimate calls, not from the mutation. Read *which* assertion fired, not just the exit code.
- WP-dream-promote-in-workspace: **A canary that differs from the exploit by ARITY proves nothing.** The three-token `--index-output` canary went green against a set that accepted the two-token form; argument count is the first thing shape-equality decides, so such a canary dies before reaching the slot under test. The `+0`-delta lesson, one level in.
- WP-dream-promote-in-workspace: **A line-oriented grep certifies a false all-clear on exactly the surfaces that matter.** A claim sweep found 12 occurrences and reported all swept; whitespace-flattened it found 15, two unswept. Then a noun-only pattern returned ZERO for the product's own statement, which is pronominal — so that file was swept by hand but was never inside its own proof. Flattened AND pronoun-aware, with the scope citation required ADJACENT to the claim.
- WP-dream-promote-in-workspace: **Read the tool's own summary, not your regex's match count.** `mirror-walk` reports `UNRESOLVED — 12`; a hand-rolled line counter said 13, and 13 was reported repeatedly. The load-bearing claim (delta +0) survived, the figure did not.
- WP-dream-promote-in-workspace: **Under default-deny, instrumentation that borrows the production seam is itself an unrecognised call.** A probe harness computing an index path through the seam reddened three exploit cells for the wrong reason. Route harnesses around the seam.
- WP-dream-promote-in-workspace: **An own-value set must hold what the run MINTED, never what it READ BACK.** Recording every successful call admitted `show HEAD:<path>` — user vault content — into the set that satisfies value slots. Only the four minting shapes contribute.
- WP-dream-promote-in-workspace: **A registered mirror pair can break in the very pass that registers it.** The canonical row was corrected while its executable copy kept the rejected claim; separately, a docs commit landed *after* the fix it describes and recorded the pre-fix state as current. Whichever copy moves, move the other in the same commit.
- WP-dream-promote-in-workspace: **`zsh` does not word-split unquoted expansions, and `\t` inside a double-quoted git ref path silently mangles it.** Both produced false measurements this session — one a false all-red boundary check, one a near-report that a shipped fix had not landed. Verify the method when a result surprises you.
- WP-dream-promote-in-workspace: **`+0/−0` with a claimed content change is a FAILURE SIGNATURE, not a clean rename.** `git mv` stages the rename; an edit made afterwards is unstaged, and a bare `git commit` ships the rename alone — so the spec landed still reading `status: In-Review`. Third occurrence of this signature (#19, #24, #61). The deeper error was in the reporting: the diffstat printed `+0/−0` and the report *described the intent* ("clean rename plus the status line") instead of reading the number. Prove the COMMIT, never the working tree: `git show HEAD:<path>` must show the new value and the diffstat must show `+1/−1` before anything is reported.
- WP-dream-promote-in-workspace: **Relaunch a dead gate fresh, never resumed, and re-verify the freeze first.** Agents died mid-run five times; each time the tip and porcelain hash were checked before anything else. A shortened brief did not help, which refuted the context-length hypothesis and identified the lane itself as down.
- WP-smoke-live-scheduler-preflight: verifying an outcome×override matrix's "must proceed" cells against a script with a destructive tail cannot be done by neutering only the probe — the product's real scheduler path is a separate concern; extract the control flow into an isolated harness with a harmless tail.
- WP-smoke-live-scheduler-preflight: a harness reusing `$(dirname "$0")/..` repo-root resolution must live inside the worktree — outside it, `$REPO` silently resolves wrong and every call fails.
- WP-smoke-live-scheduler-preflight: a caller-side dispatch on probe exit codes must be closed over the whole integer range — rc 126/127 ("the probe could not be asked") falling through to the CLEAN default is the fail-open all three round-1 reviewers converged on.
- WP-failloud-survives-state-write-failure: `chmod(state/, 0o500)` is not a durable both-writes-fail simulation — `mkdirPrivate` heals it before the append; pre-created directories at the target paths (EISDIR) are portable and unhealed.
- WP-failloud-survives-state-write-failure: `renameSync(tmp, dest)` replaces a symlinked dest rather than following it; a directory planted at the deterministic `${file}.${pid}.tmp` name is the reliable throw trigger.
- WP-failloud-survives-state-write-failure: a spec that says a string is "derived inside X" while also requiring the caller to throw the same string is unsatisfiable — the resolution is one shared template both consume; write the contract that way from the start.
- WP-failloud-survives-state-write-failure: a generic forwarded opts object is an injection channel — any behavior-changing discriminant added to it must be overridden (spread-then-force) at every call site that must not honor it, and poison-tested.
- WP-failloud-survives-state-write-failure: `failLoud`'s append and email share one try — an appendAlert throw skips the email; do not assume the email is always attempted.
- WP-scheduler-mutation-home-authority: os.userInfo is a call-time property lookup — a test can force the no-passwd-entry branch by reassigning it; no seam needed.
- WP-scheduler-mutation-home-authority: a canary argv proves "nothing was spawned" better than a status code — a refusal and a spawn that exits 1 are indistinguishable by status.
- WP-scheduler-mutation-home-authority: an "enumerate your own good" probe is only as good as its inventory of its own names — Wienerdog uses three structurally different identifier shapes; derive each from the generator that writes it and pin with parser tests over real client output; and match at the identifier BOUNDARY, never by substring.
- WP-scheduler-mutation-home-authority: a counted test seam whose counter is discarded is indistinguishable from no seam; stub the gate out and watch which tests fail.
- WP-scheduler-mutation-home-authority: Object.assign(process.env, env) can only add/overwrite — an ambient-inheritance strip must happen on process.env itself, before any env object is built; and in shell, the clear of a granted variable must be the grant's own else, never a downstream unset region.
- WP-scheduler-mutation-home-authority: a quick inline node -e is still a real invocation — a safety rule living in harness scaffolding gets skipped exactly when moving fast; the incident this cost is documented in the 2026-09-01 daily note.
- WP-private-state-writers-mode-pin: a WP that closes a "predictable temp path" hazard breaks any earlier test that used that predictability as its failure-injection fixture — check sibling WPs' suites before assuming a red test is your own defect.
- WP-private-state-writers-mode-pin: the stubCollaborators require-cache-swap idiom is the established way to unit-test an unexported failure branch without widening a production signature.
- WP-private-state-writers-mode-pin: delegation spies (writer → primitive, with argument-shape assertions) are what keep a mode contract from regressing invisibly — final-mode observation alone passes a chmod-after-write replacement.
- WP-show-slot-own-value-kind: a pin that is spelled and a pin that is interpolated are identical at run time, so no behavioural test can tell them apart — the whole RED/GREEN matrix, the index test and every presence-grep go green under the interpolation. Only a check over the SOURCE FORM can hold that choice, and it has to be committed: a proof living in the spec's verification steps cannot bind a future WP that reads only its own spec.
- WP-show-slot-own-value-kind: when a checker must FIND its subject inside a large file, it is enumerating the ways the host language can hide it, and that never closes — four rounds broke the locating four different ways. The fixed point is to delete the locating step: give the artifact a file of its own and hash the whole file. The evasion class then stops existing instead of being enumerated away, and the machinery shrinks to read, collapse, hash, compare.
- WP-show-slot-own-value-kind: a canary that differs from its exploit in ARITY proves nothing about the exploit — it dies on length equality before reaching the slot under test. The show vector is two tokens BECAUSE the pinned shape is two tokens; a three-token probe would have certified a rejection the set never made. Same lesson the read-tree gap cost, one shape over.
- WP-show-slot-own-value-kind: a stated invariant that one of its own members falsifies cannot decide the next case. The own-value set's "MINTED, never READ BACK" was false for rev-parse HEAD on the day it was written; the fix is to restate the membership rule so every member satisfies it, not to evict the member (evicting head would redden every legitimate run — it feeds three own-value slots).
- WP-show-slot-own-value-kind: a docs surface can be stale on the day it lands. Both prose mirrors of the own-value count were written by a commit that is a DESCENDANT of the commit that already fixed the code — the prose recorded the pre-fix state. Checking a mirror's ancestry against the fix it describes is cheap and catches this class.
- WP-show-slot-own-value-kind: a count beside a list is a second copy that goes stale on its own. Both prose surfaces stated "four sources" while the list of produces markers was the real surface; the remedy is to delete the number and point at the list, which is now written into W1(c) as a standing rule.
- WP-show-slot-own-value-kind: re-read a rewritten canonical cell WHOLE. W1(c) is ~46 KB on one line; no mirror checklist can see inside it and the failure mode is a new sentence landing while the superseded one survives three clauses away. Extract the line, fold it, read it end to end — and sweep the retired sentences' own unique phrases to zero as the mechanical half of that check.
- WP-show-slot-own-value-kind: a digest derived from a RECIPE cannot survive two readings of the recipe. Two independent reconstructions of "move these lines, then apply these edits" landed 125 characters apart. Shipping the artifact as one canonical block, extracted mechanically by the spec's own command, is what made the pin reproducible — the implementer must run the extraction, never retype the block.
- WP-audit-c-close-disposition: the owner's severity ruling for this spec's Dispatch precondition lives on a not-yet-merged PR branch (#201); fetching it required `git fetch origin <branch>:refs/remotes/origin/<branch>` before `git show` could quote it verbatim. Round 2: better to quote it a second time, in-patch, inside a deliverable this PR actually ships (the logbook), than to leave dependents citing only the unmerged branch.
- WP-audit-c-close-disposition: V6's AC5 check is a strictly per-line check — a hard line wrap between two required terms silently fails it even inside one paragraph.
- WP-audit-c-close-disposition: an unguarded shell pipeline at the end of a verification script reports its own final `echo`'s exit code, not the gates above it — `|| { echo FAIL; exit 1; }` on every gate is required once a script's tail includes anything beyond a final assertion.
- WP-audit-c-close-disposition: this session's Bash tool invokes commands under zsh, which does not word-split unquoted `$VAR` expansions by default — a verification script written for bash (this spec's V6 and V2 (b), which rely on word splitting) gives false failures pasted directly into a zsh-backed tool call; wrap in `bash -c '...'` or run via `bash script.sh`.
- WP-audit-c-close-disposition: **the two-round rule matters as a routing signal, not just a courtesy.** Round 1 fixed D2 (b)'s over-claim by narrowing the wording and citing an outside raw; round 2's reviewers (independently, plugin and wd-reviewer) found the *same* defect family recurring in the same cell — the citation itself didn't hold up under byte inspection. Recognizing "this is round 2 on the same cell" and routing to wd-architect rather than attempting a third implementer-side wording patch is what actually closed it: the fix was to make the step prove the claim, not to narrow the prose around an unproven one again.
- WP-index-guard-residuals: **a comment-only edit is not a no-op if the file is cited by line.** Rewriting two comments in `src/cli/dream.js` added seven lines and would have rotted ~15 `cli/dream.js:NNN` citations inside row W1(c) — the nine pinned-set call sites among them, i.e. the entries this WP was editing. The check is cheap: `git show origin/main:<f> | wc -l` against `wc -l <f>`, then `sed -n '<n>p'` on each cited anchor. **And it cuts both ways:** the *test* file's spec-mandated growth rotted nine citations in a Done spec that is out of boundary (Discovered issue 3), which line-count neutrality could not have prevented — that one needs the citations to stop being positional.
- WP-index-guard-residuals: **"derive both sides independently" is about where the data comes from, not how clever the script is.** The verifier `require()`s the module for one side and parses the committed markdown for the other, carrying no expected mapping — which is why the module-side `produces` flip reddens it. A count, an ordinal parser and a verifier with the mapping hard-coded were each measured to pass a wrong state; the mutation that catches the last of those changes only the module.
- WP-index-guard-residuals: **a Symbol is the right shape for "not a verdict".** Making the refusal a Symbol makes the owner's ratification structural rather than a naming convention — no assertion, grep or later reader can mistake it for one of the four verdict strings.
- WP-index-guard-residuals: **re-reading the whole 46 KB cell caught what no pattern could — and re-reading it once was not enough.** My own pass found clause (a)'s parenthetical contradicting its *"AUTHORSHIP, not visibility"* ruling three clauses later, and a JSDoc promise the code change falsified. It did **not** catch a sentence I had just written claiming a registration that does not exist (round-1 finding 1) — a writer re-reads their own new sentence as intent, not as text. The cheap guard is mechanical: for every "X is registered in Y" you add, open Y and grep it.
- WP-preservation-abort-widening: several pre-existing tests across `dream-validate.test.js` and `dream-promote.test.js` encoded the OLD (buggy) behaviour directly as their assertion — not as regression fixtures, but as the thing being verified (e.g. "a hard secret whose only preserve fails refuses normally with an empty record"). A spec that widens a trigger class should expect to find and rewrite these, not just add new coverage; grepping for the literal old return shapes (`preserved: []`, a bare `{refuse:true, reason}`) across the whole test file surfaced them faster than running the suite and fixing failures one at a time.
- WP-preservation-abort-widening: a behavioural change to a shared contract point (here, "a refuse verdict must carry a non-empty preservation record") can be correct in the file it's specified against while silently breaking unrelated test fixtures elsewhere in the same file that happen to exercise the same code path incidentally. Worth a full-file grep for the mutated shape before trusting a green run on the new tests alone.
- WP-preservation-abort-widening: assertions like `!message.includes('\n')` are vacuously true unless the fixture driving them actually contains a newline — a security-checklist requirement phrased as "the rendered message contains no raw X" needs at least one fixture that actually carries X, or the check never really ran.
- WP-preservation-abort-widening: embedding a literal control byte (e.g. a real ESC character) directly in a JS string literal via a tool call is fragile — it round-trips fine through `node --check` but produced a raw 0x1B byte sitting in the source file. `String.fromCharCode(N)` is the robust way to construct hostile-byte fixtures in source.
- WP-criterion-red-harness: **a single NUL byte makes `grep` treat a source file as binary**, so every `! grep -q …` guard over it goes vacuously green. Caught only by running the grep in its RED state.
- WP-criterion-red-harness: **`NODE_TEST_CONTEXT=child-v8` leaks from any `node --test` process into every descendant.**
- WP-criterion-red-harness: **`process.cwd()` is canonicalised while an injected `TMPDIR`/`HOME` is not.**
- WP-criterion-red-harness: **a snapshot manifest must record mode bits for directories too.**
- WP-criterion-red-harness: **row 2b and criterion 9 pulled apart on `WIENERDOG_CLAUDE_DIR`.**
- WP-criterion-red-harness: (r1) **measuring a reporter on ONE Node and calling it a contract is the defect this WP exists to catch.** Downloading the actual CI Node cost two minutes and turned "confirm CI after push" into a local check.
- WP-criterion-red-harness: (r1) **`chmod 0500` is `r-x` — it refuses new entries but PERMITS TRAVERSAL.**
- WP-criterion-red-harness: (r1) **a basename filter applied BEFORE type validation is a hole.**
- WP-criterion-red-harness: (r1) **a path check on a string is not a path check.**
- WP-criterion-red-harness: (r1) **a runner that reads a child's stdout must first establish the child FINISHED.**
- WP-criterion-red-harness: (r2) **"the process exited 0" is not "the tests passed", and a CONTROL is exactly where that gap bites.**
- WP-criterion-red-harness: (r2) **an isolation mechanism must state the hosts where it cannot work.**
- WP-criterion-red-harness: (r2) **`readFileSync` on a FIFO blocks forever, and a synchronous block cannot be interrupted by a test timeout.**
- WP-criterion-red-harness: (r2) **`process.exit()` discards queued pipe writes.**
- WP-criterion-red-harness: (r2) **inject the INPUT, not the ANSWER.**
- WP-criterion-red-harness: (r3) **identifying a thing by its NAME when the format gives you STRUCTURE is how real data gets deleted.**
- WP-criterion-red-harness: (r3) **a set membership check and a content check are different checks.**
- WP-criterion-red-harness: (r3) **a guard that refuses a host must not take the test suite down with it.**
- WP-criterion-red-harness: (r4) **the obvious fix and the real fix can be different things, and measuring is the only way to know.**
- WP-criterion-red-harness: (r4) **a text round-trip is not a byte round-trip.**
- WP-criterion-red-harness: (r4) **spoofing a capability check is not the same as having the capability.**
- WP-criterion-red-harness: (r4) **the mutation matrix keeps catching its own tooling.**
- WP-criterion-red-harness: (r5) **the same defect recurs at every layer that reads a file.**
- WP-criterion-red-harness: (r5) **a capability is something you measure, not something you infer from `process.platform`.**
- WP-criterion-red-harness: (r5) **an unreachable guard is not a useless one — list it, don't delete it.**
- WP-criterion-red-harness: (r6) **when a format gives you structure, MEASURE the structure before encoding a rule about it.**
- WP-criterion-red-harness: (r6) **the boundary you forgot to classify is the one at the edge of the loop.**
- WP-criterion-red-harness: (r6) **a mutant that does not reproduce the defect is not evidence.**
- WP-criterion-red-harness: (r7) **a containment check has a direction, and getting it backwards fails LOUD — the lucky case.**
- WP-criterion-red-harness: (r7) **adding a directory to a hierarchy you have hardened means re-hardening the hierarchy.**
- WP-criterion-red-harness: (r7) **enforce the contract you have, not the one that would be convenient.**
- WP-criterion-red-harness: (r7) **a disposition can be wrong, and the second reporter is not noise.**
- WP-criterion-red-harness: (r8) **normalising ONE side of a comparison is worse than normalising neither.**
- WP-criterion-red-harness: (r8) **pinning a rule is how you find out the rule was never reachable.**
- WP-criterion-red-harness: (r9) **`cwd:` moves the process; it does not move the ENVIRONMENT'S idea of where the process is.** `PWD` and `OLDPWD` are inherited strings, and a suite that reads them saw the real checkout in all three phases. When a contract says "the working directory", the variables that claim to name it are part of the set — an isolation boundary drawn over syscalls has to be drawn over the environment too.
- WP-criterion-red-harness: (r9) **some ambiguities are in the DATA, and the honest move is to refuse, not to pick.** Node renders a control character in a test name as a JS escape and TAP then doubles the backslash, so a real newline and a literal backslash-`n` are byte-identical in the stream. Both halves of the finding could not be satisfied at once; measuring the raw bytes is what showed that, and refusing the un-observable half beats a decoder that quietly binds a proof to whichever name it guessed.
- WP-criterion-red-harness: (r10) **a tie-break is an argument, and an argument can be wrong.** Round 3 kept the ambiguous shape on the reasoning that keeping "only adds an identity, which can only make the rules stricter". That holds only while the added identity is not one somebody DECLARED — and the exploit is exactly to name it. Three rounds of review passed over that sentence, including mine writing it twice; what found it was an adversarial fixture, not re-reading.
- WP-criterion-red-harness: (r10) **an isolation boundary has to be re-measured at the entry point people actually use.** Everything in this lane is spawned with `cwd:` set, and the environment npm hands the process still named the real checkout in four more variables. The durable fix is not a longer list — it is a test that ASKS the tool which variables name its cwd and requires each to be handled, because the list has already grown twice.
- WP-criterion-red-harness: (r11) **when you retract a decision, hunt the prose that argued for it.** I reversed the round-3 tie-break in code and wrote a new paragraph explaining why — and left the old paragraph thirteen lines above, still reading as live justification for the thing I had just removed. Code review caught what my own retraction did not: the dangerous artefact of a reversal is the argument left lying around.
- WP-criterion-red-harness: (r11) **a grammar is not a bound.** `id` was specified as a kebab slug and validated as one; nothing said 300 bytes, and nothing needed to — the filesystem said it instead, at `mkdirSync`, past the last try block. Where a contract constrains SHAPE, the implementation still owes every legal value a legal representation.
- WP-criterion-red-harness: (r12) **an excluded directory is not an absent one while `NODE_PATH` exists.** The copy carried no `node_modules`; the environment supplied one anyway, and all three phases resolved through it.
- WP-criterion-red-harness: (r12) **`NODE_OPTIONS` is an execution channel, not a preferences string** — `--require`, `-r` and `--import` all run a file of the caller's choosing inside every phase.
- WP-criterion-red-harness: (r12) **when a filter takes one barrier, ask whether the world has two.** `--root` and the invoking checkout are the same directory in the common case and different in the supported one, and the test that should have caught it passed the same value as both.
- WP-criterion-red-harness: (r12) **a capability gate can only HIDE a broken probe, never fail on one.** Deleting the probe's own `chmod` turned the whole suite green-by-skipping; the mutation matrix caught what review could not, and the answer was to assert the probe's mechanism rather than its verdict.
- WP-criterion-red-harness: (r12) **a refusal added at LOAD inherits criterion 13's rule** — it must skip the unit suite, not fail it, which means it belongs on the same injection seam as the refusal it joins.
- WP-criterion-red-harness: (r13) **the dependency channel that needs no variable.** Stripping `NODE_PATH` felt like closing the door; Node's ancestor walk is a second door with no handle to remove. Ask what the RUNTIME does by default, not only what the environment can be made to do.
- WP-criterion-red-harness: (r13) **"the write failed" is not "the permission stopped it".** A guard whose whole job is deciding whether a safety mechanism is real must read the error code, or it will accept the wrong evidence in the one direction that matters.
- WP-criterion-red-harness: (r13) **an untested guard is a claim, and the honest options are cover it or disclose it.** The filesystem-root barrier survives deletion; measuring its reachability and its failure direction — closed — is what turned it from an implicit assumption into a disclosed one.
- WP-instruction-basename-currency: a worktree with a symlinked top-level `node_modules` breaks `npm run red-proofs` outright (its SNAPSHOT phase refuses any symlink before applying the `node_modules` exclusion, by deliberate design — see `scripts/red-proofs.js:775-781`). `npm test` and `npm run lint` both tolerate the symlink fine; only the red-proofs runner's hardened anti-symlink check trips on it. A real (non-symlinked) `node_modules` is required to run V5 in a worktree set up this way — future dispatches into symlinked worktrees should budget for this.
- WP-instruction-basename-currency: `cp -RL` to flatten a symlinked `node_modules` is the wrong fix — it dereferences the package-internal `.bin/*` symlinks too (npm relies on those staying relative symlinks into their sibling package directories for ESM/CJS resolution), which broke `markdownlint-cli2` specifically. `cp -R` (no `-L`) copies the top-level symlink target as a real directory while preserving nested symlinks, and that is what both `npm run lint` and `npm run red-proofs` need.
- WP-instruction-basename-currency: Table D's choice between "declare every own-body test the RED mutation reddens" and "`testNamePattern` scoped to the one test the row is about" is a real simplicity lever — a shared-file mutation like reverting `INSTRUCTION_BASENAMES` reddens every test that exercises that constant, and scoping the RED run avoids having to hand-verify each one's exact `signal` substring against the mutated tree; round 1 confirmed the payoff when a fourth test (criterion 3) started exercising the same constant and needed zero changes to the proof declaration.
- WP-instruction-basename-currency: "criteria 2, 3 and 7" in a Deliverables cell is easy to under-read as "three tests, done" when two of the three already look covered by hand-verification (V2 pins criterion 3 outside the suite). The gate caught it because it checked what's IN `npm test`, not what's true about the code — a completeness argument stated in the spec's own prose (inventory ⊆ code plus equal size ⇒ set equality) is not itself a test until something in the suite asserts the equal-size half.
- WP-instruction-basename-currency: a runbook step's *contract* (Table C: same-PR code/test updates on a set change) implies a position, even when the spec's Deliverables cell only says "one new numbered step, inserted so the existing steps renumber consistently" without naming where. Read the obligation's own text for what has to happen before what, not just the mechanical insertion instruction.
- WP-dot-segment-denial: the spec's V2 node -e script is a complete, self-contained reference implementation of Table F's grading (generator, distribution check, seed/N guards) — writing the test file's T1/T4 was mostly a matter of splitting that script's logic across two `test()` bodies with band-marker messages, not designing new grading logic from scratch. Specs that inline a runnable oracle this literally save real implementation time.
- WP-dot-segment-denial: mixed-encoding Unicode literals (precomposed vs. NFD-decomposed accented characters) in a spec's prose are easy to transcribe inconsistently into source by eye. Worth a codepoint-level `node -e` sanity pass over every non-ASCII string literal in the finished test file before trusting it — in this case the transcription happened to land correctly, but there was no way to know that without checking codepoints directly.
- WP-dot-segment-denial: for a RED-proof `find`/`replace` pair with an interpolated template literal containing escaped backticks (`` `not admitted: path segment \`${seg}\` begins with a dot` ``), constructing the JSON via a small Python script (rather than hand-escaping the string inline) made it easy to verify `content.count(find) == 1` before writing the file, and avoided a subtle escaping bug that would only surface when `red-proofs.js` tried to apply the mutation.
- WP-dot-segment-denial: a new integration test that spawns/verifies external tools (here, `adopt`'s pin preflight resolving `claude`) must build its ambient-tool assumptions on the same file's *existing* fixture, not on the developer machine's PATH — a real `claude` on my own PATH masked the gap through every local run, and it only showed up as a CI failure. Verifying "no real tool leaks through" needs an actual PATH-stripped run, not just a passing local one: `which <tool>` on the constructed PATH is cheap insurance before trusting a stub. Also noted: on this machine, both `/Users/gyulafeher/.local/bin/claude` and its homebrew symlink `/opt/homebrew/bin/claude` had to be excluded — `node`'s own directory was not a safe PATH entry to reuse as-is.
- WP-dot-segment-denial: a randomized test that writes real filesystem entries and then checks a validator's output must compare against what the filesystem hands BACK (`readdirSync`), not the string used to create the entry — on a normalizing filesystem (macOS HFS+/APFS) those two can differ for any composed accented character, and the divergence is seed-dependent, so it will pass on most seeds and most CI runs and still be a real bug. This is the same shape of trap as comparing case-folded output against un-folded input, just one layer removed (the OS does the folding instead of the code under test).
- WP-dot-segment-denial: a "no false negative" oracle over a persisted/read-back-and-recompared pair (the adopt round-trip test's conjuncts) needs at least one CONCRETE expected value asserted somewhere in the chain, not just internal cross-consistency checks (persisted-vs-read-back, or "no dot segment") — internal consistency is satisfied by an empty result just as well as by a correct one. The fix that actually discriminates is cheap (one `assert.equal(x, '01-Projects')`) but easy to omit when every other assertion in the test already "looks like" it's checking something real.
- WP-dot-segment-denial: a capture regex built around a NAMING CONVENTION (`_dir` suffix) is a silent coverage gap waiting for the one key that doesn't follow the convention — here `daily_filename`, which is validated by the identical function as the six `_dir` keys but doesn't share their name shape. When a test needs "every key a producer writes", parsing the actual block boundary (as the production reader does) is more robust than pattern-matching on a naming habit that happens to hold for most of the keys.
- WP-dot-segment-denial: `.find(predicate)` plus `assert.ok(result)` checks "at least one exists", not "exactly one exists" — a cheap substitution for `.filter(predicate)` plus `assert.equal(length, 1)` when the test's whole argument depends on there being exactly one match (here, a single directory the loop itself created and is about to read back). The two read almost identically at a glance; only the second one fails loud on a leaked or duplicated entry instead of silently grading whichever one `.find()` happened to return first.
- WP-quarantine-banner-location: a spec sentence that COUNTS what a fenced block below it contains ("becomes these eleven lines, byte-exactly" over a ten-line fence) is a mirror of the fence, and it goes stale the first time the fence is edited. Three of this WP's four post-merge errata are the same shape — a count or a size restated in prose next to the table or artefact that already fixes it ("eleven lines", "steps 18-20", "two-line comment"). Under ADR-0031 that is one contract family landing three findings in one round: the fix is not to correct the three numbers, it is to stop writing them a second time. If prose must reference an artefact's size, register it in the Mirrored Surface Checklist BY SHAPE ("any count of the L7 header's lines"), not as one named sentence.
- WP-quarantine-banner-location: an instruction that MOVES part of an enumerated comment block ("move it; do not retype it") owes an explicit disposition for the parts it leaves behind. Row L7 relocated `(i)` and `(i-b)` and orphaned `(ii)` — no numbered parent within ~50 lines — and the implementer was correct to leave it, because renumbering is retyping and retyping was forbidden. The spec should have said which of "renumber it" or "accept the orphan" it wanted; a reviewer had to ask, and the answer had to be given after merge.
- WP-quarantine-banner-location: a fault-injection seam is a CLAIM ABOUT WHERE THE BOUNDARY IS, so it must sit at the FIRST durable claim, not at a convenient later one. Round 3 found criterion 6's seam at the digest rename — a whole step downstream — which let a placement just after `writeLedger` pass while still leaving a real window. Two states are not enough to validate an ordering detector: rehearse the NEAR-MISS placement as a third state, and reproduce the superseded detector PASSING the wrong tree before replacing it, so the replacement is justified by a measurement rather than by an argument.
- WP-quarantine-banner-location: to test a crash window, delegate-then-throw rather than replacing the call — the seam has to let the real durable write happen and only then fail, or the test proves the wrong thing. And when a seam depends on a fixture's preconditions (here `watermarks.json` having none), assert those preconditions in the test: a seam that silently never fires reads exactly like a seam that fired and found nothing.
- WP-quarantine-banner-location: when a package grows BEHAVIOUR (round 2's reorder turned a text-only change into a code change), sweep every rationale that described it as textual — the idempotence argument, the blast-radius claim, the size justification. A rationale written against an earlier shape of the package is a mirror of the package, and rounds 3 and 4 each found one that had not moved.
- WP-quarantine-banner-location: a finding's PREMISE and its BOUNDS are different claims and both need verifying. Round 4's legacy-record finding was real, but three of its stated bounds were wrong: L2 is not affected (it renders three integers the current run computed), `refreshWarnings` cannot throw (measured), and the failure has four conjuncts rather than one. Adopting a finding's framing wholesale imports its errors into the spec.
- WP-quarantine-banner-location: price the USER-VISIBLE cost before pricing the fixes. The legacy-record residual costs exactly one fruitless look, and no wording removes it because no surface can tell a legacy record from a sound one — which is what makes "accept as a named residual" the recommendation rather than a concession. Pricing the three candidate fixes first would have made the cheap answer look like giving up.
- WP-quarantine-banner-location: "byte-identical to the previous round" in a round record must come from an actual byte compare (sha256 of the extracted block), not from "I did not edit that section". Round 4 found §3.2 claiming Table L was byte-identical to round 2 while row L7's evidence cell had in fact changed.
- WP-quarantine-banner-location: a parked owner item needs a CANONICAL HOME in the contract table, not just a block in the Dispatch precondition — the precondition is a mirror, and so are the section's heading and its opening paragraph, which carry the item COUNT. Round 5's only finding was a heading still reading "one owner confirmation" over a section that had said "all THREE" since round 4. Register headings as mirrors when they carry a count.
- WP-quarantine-banner-location: a review objection routed as out-of-scope can still be worth APPLYING when it catches a clause that is false rather than merely wider — round 5's "the copies are still on disk" was qualified with the shelf cap this spec already measured, while the eviction it implied was routed to the successor. Routing the scope and fixing the falsehood are separate decisions.
- WP-quarantine-banner-location: zsh does not word-split an unquoted multi-line variable, so `node scripts/boundary-check.js $(git diff --name-only …)` passes one giant argument instead of a file list. Pipe through `xargs` (`git diff --name-only main...HEAD | xargs node scripts/boundary-check.js <spec>`) — the un-split form does not error, it just checks nothing.
- WP-quarantine-banner-location: reusing an already-shipped fixture (the symlinked-report fixture) to reach the L7 failure-injection state was far simpler than driving the EP2 gate to produce the same state from scratch. When a test needs a run in a particular condition, look first for an existing test that already builds that condition.
- WP-quarantine-banner-location: line-number citations in `done/` specs are trustworthy for EXISTENCE, not for POSITION — the file has moved since the spec was written. Grep for the cited text; use the line number only to disambiguate between multiple hits.
- WP-quarantine-banner-location: never write into a worktree while a review gate is reading it. One untracked file the orchestrator added mid-run voided the round-4 Codex-plugin verdict on its own read-only porcelain check, and the channel had to be re-run on a later tip. Adjudicate the findings anyway (the runbook requires it), but the verdict does not count.
- WP-quarantine-banner-location: a subagent "died with the session" is an assumption, not an observation — check its worktree's `git log` before rebuilding anything. And a tree copied from an earlier session's scratchpad is of UNKNOWN state: rebuild from `git archive` against a named commit rather than trusting a copy whose provenance you cannot state.
- WP-quarantine-preserve-durability: a `patchFs` replacement that calls the real function must capture the ORIGINAL first and call through that reference — `fs.openSync(...)` inside an `fs.openSync` patch is a self-call and recurses until the stack dies. The repo's helper hands you `orig` for exactly this; the bug is silent at write time and instant at run time, and it looks like a hang rather than a mistake.
- WP-quarantine-preserve-durability: a path matcher written as a PREFIX (`p.startsWith(tmpDir)`) stops discriminating the moment the code under test also opens the DIRECTORIES under that prefix — which is precisely what a directory-flush protocol adds. Constrain the matcher to the thing you mean (`path.basename(p).startsWith('.tmp-')`), because a seam that fires on four extra objects reads as a passing test right up until it reads as a mysterious one.
- WP-quarantine-preserve-durability: in a RED-proof identity, EVERY assertion needs its `[QPD-N]` band marker, not just the interesting one — a mutation can redden any assertion in the test, and an unmarked one produces a red the runner cannot attribute. The audit is mechanical (extract each identity's body, count `assert` statements without the marker) and helper calls are the one legitimate exception, so assert the marker inside the HELPER instead.
- WP-quarantine-preserve-durability: a mutation-based proof must read what the mutation may DELETE before it deletes it. Guard the read — capture the value, or assert its presence first — because a proof whose fixture throws on a missing field reports the mutation as an ERROR rather than as a RED, and an error is the one outcome that tells you nothing.
- WP-quarantine-preserve-durability: when a permission classifier blocks a `git` invocation, the fix is usually a DIFFERENT SUBCOMMAND expressing the same question, not a retry or an escalation — `git diff` refused where `git show --stat` and `git log -p` answered it. Reach for the neighbouring read-only command before assuming the information is unavailable.
- WP-quarantine-preserve-durability: NAME THE ADVERSARY BEFORE PINNING OBJECTS. Two consecutive review rounds each found another unpinned object (the artifact's inode, then the destination's ownership, the directory inodes, the symlink form of the check) because the protocol had never said who it defends against. A protocol with no named adversary has no fixed point: every round finds one more window, and every fix is a patch. The circuit breaker's answer is a CONTRACT ROW, not a third patch.
- WP-quarantine-preserve-durability: SYMMETRY OF CAPABILITY is the argument that decides whether a hardening is worth taking. A process that can swap a directory aside during your flush can also delete the preserved copy one instruction after you return — so the descriptor pinning both review channels recommended buys nothing against the actor it targets. That reason is decisive rather than economic, which is what lets you decline a reviewer's own recommendation on the record instead of pricing it.
- WP-quarantine-preserve-durability: split an adversary contract into three named tiers — GUARANTEED, DISCLOSED, OUTSIDE — and make every surface that mentions a residual name the tier it is in. A residual MOVING between tiers is then a contract change, visible as one. Without the tiers, "we don't defend against that" and "we haven't got to that yet" are the same sentence, and reviewers will keep re-finding the second one.
- WP-quarantine-preserve-durability: PROVENANCE BEATS VERIFICATION. `O_CREAT|O_EXCL` is a provenance primitive: it does not check that the file is yours, it makes it yours, and a check you never have to run cannot race. The same move made the commit no-clobber (`linkSync` refuses an existing name), which turned "did another run take this path?" from a window to be narrowed into a question that cannot arise.
- WP-quarantine-preserve-durability: prefer a FIXED CHAIN derived from two known anchors over a set derived from what the call happened to create. A derived set is a list somebody maintains — it grows a member the day the code creates one more directory, and no reviewer can tell a missing member from an intentional one. A closed list computed from `stateDir` and `qdir` alone is auditable by reading it.
- WP-quarantine-preserve-durability: ONE MUTATION PER BRANCH in a RED-proof declaration. A mutation that reddens two independent branches proves neither of them: you learn that something broke, not which guarantee the test was defending. When a chain has four members, that is four mutations, and the one member with no mutation of its own is the one whose flush nobody is actually proving.
- WP-quarantine-preserve-durability: when a helper's body is load-bearing at SEVERAL call sites, pin the WHOLE body byte-exactly rather than the signature plus prose about what it does. Prose about a helper is a mirror at every site that calls it; the body pinned once is the same fact stated once, and the `find` strings in the RED declarations quote it for free.
- WP-quarantine-preserve-durability: a predicate that returns a boolean owes a sentence, AT EACH CALLER, saying what `false` means there — and if `false` means two different things at two callers ("it is not yours" versus "I could not tell"), it is not a boolean. Make it three-valued and THROW for the third case rather than returning a sentinel: a token has to be checked at every site and will be missed at one, while a throw is checked nowhere and handled everywhere.
- WP-quarantine-preserve-durability: a helper that returns only a boolean HIDES EVERYTHING ELSE IT DID — a descriptor it opened, a path it created, a lock it took. Give such a helper an explicit lifecycle statement (who closes what, on which path, including the throwing one) or the leak is invisible in review: the call site reads correct, and the resource is gone.
- WP-quarantine-preserve-durability: state a concurrency guarantee AT A LINEARIZATION POINT and not one word past it. "The name resolves to this inode" is true at the gate and unclaimable after it; "the bytes were read after a completed flush of that inode" is an ORDER, not a COVERAGE — `fsync` and `read` are separable operations on a mutable inode and Node fuses nothing, so no ordering binds a completed flush to the buffer you return. Two rounds tried to make the clause TRUE before the third round restated what it CLAIMS.
- WP-quarantine-preserve-durability: DO NOT TEST A DISCLOSED RESIDUAL. A test that exercises the case your contract says it does not cover will one day fail, and its failure means nothing — it asserts a guarantee you deliberately declined. Disclosed residuals belong in the contract row and in the "what these proofs do not establish" paragraph, never in the suite.
- WP-quarantine-preserve-durability: descriptor NUMBERS are reused, so a leak test keyed on a number proves nothing in general — `fstatSync(n)` reads identically for "closed" and "closed then handed to something else". Assert the still-open SET (open descriptors before and after) when you mean "nothing leaked". This spec's own D3 fixture states the hazard in a comment and then keys on the number anyway; QPD-7 is the identity that does it properly.
- WP-quarantine-preserve-durability: REGISTER MIRRORS BY SHAPE, NOT BY NUMBER, and record the audit COMMAND together with its OUTPUT. "Any count of the chain's members" survives a table edit; "the four directories" goes stale the day there are five. A registration that carries the grep and what the grep printed is re-runnable by the next round; one that carries a claim is not.
- WP-quarantine-preserve-durability: a Deliverables cell that PREDICTS a diff in prose ("the changes to shipped tests are exactly THREE…") fails in both directions — it counts a change that is not there and misses one that is. This one mispredicted twice in two rounds: an assertion the spec forbade here and mandated in another row, and a third stale test title the census never saw. When a cell must fix a contract, fix it in a TABLE with one row per permitted change and have the acceptance criterion assert THE TABLE.
- WP-quarantine-preserve-durability: enumerate a spec's residuals FROM THE CODE, not from the last round's prose. Reading the shipped source for what it does not guarantee found residuals no review round had raised; re-reading the previous round's residual list only reproduces its blind spots. The same applies to counts — a self-read of the whole document after the edits and BEFORE the commit found thirteen further items across two rounds, most of them mirrors THAT SAME PASS had just created, which a checklist cannot catch because it guards surfaces that already exist.
- WP-quarantine-preserve-durability: a STALE POINTER CAN BE A LETTER. When an amendment supersedes a paragraph another `Done` spec points at, the honest fix is not to rewrite the paragraph — it is to append a dated clause saying what is now shipped, so the old text stands as the record of the tree it described and the pointer resolves to something that tells the reader both. Byte-exact clauses pinned by a verification make that safe to do in a `done/` file.
- WP-quarantine-preserve-durability: a RED-proof declaration's `why` string is a CONTRACT SURFACE that nothing lints. `find`/`replace` are checked mechanically and `expectRed` is checked against the suite, but `why` is free text that a reader trusts as the statement of what the mutation proves — so a stale `why` is a false claim with a green run behind it. Review the `why` strings as prose against the table row they cite, every round.
- WP-quarantine-preserve-durability: when the SAME CLASS of finding yields another window three rounds running, stop adding checks and NARROW THE CLAIM. Each additional check makes the protocol bigger and the guarantee no truer; restating what the protocol actually promises makes the remaining windows disclosed residuals instead of unfixed defects — and disclosed residuals do not come back next round.
- WP-audit-d-code-derived-recipients: editing a vendored operating skill BREAKS THE CHECKED-IN DIGEST ANCHOR. `src/core/runtime-skill-digests.json` records the sha256 of each `skills/*/SKILL.md`, so a spec that edits one and does not list the anchor as a Deliverables row cannot be implemented green — 13 tests red, and a merge leaves the routine refusing to run as "tampered skill text". A Deliverables table must cover the artifacts a change INVALIDATES, not only the files it edits.
- WP-audit-d-code-derived-recipients: MONKEYPATCHING AN EXPORTED FUNCTION reaches only the callers that look it up live on `module.exports`. A caller holding a direct local reference (a destructured import, a closed-over binding) never sees the patch, so the test passes against code the patch never touched. Patch the seam the caller actually reads, or inject.
- WP-audit-d-code-derived-recipients: a mutation that must change TWO CALL SITES is one `find`/`replace` only if both route through a single local binding. Resolve the default ONCE at entry and have every site use that binding — then one mutation moves both, and no implementation can branch so that the tested path and the production path differ.
- WP-audit-d-code-derived-recipients: `red-proofs --wp <id>` reports run-level FILTERED when other WPs' declarations coexist in the tree. The WHOLE-TREE run is the authoritative one; a filtered green is a statement about a selection, not about the harness.
- WP-audit-d-code-derived-recipients: A MUTATION THAT CRASHES REDDENS EVERYTHING AND PROVES NOTHING. A rewrite that deleted a declaration line produced a `ReferenceError` masked as the generic verb failure, and every identity in the suite went red — which reads exactly like a strong proof. When an `expectRed` set comes back larger than declared, stop: apply the mutation to a scratch copy and READ THE REAL ERROR before believing the set.
- WP-audit-d-code-derived-recipients: when the ADR-0031 breaker fires on a contract, the answer is a CONTRACT, not a third patch. Table B's five findings across two rounds were one defect wearing different clothes — parsing before bounding — and the fix was to restate the contract as an ORDER of operations over raw values with the bound first, not to keep correcting the parser.
- WP-audit-d-code-derived-recipients: BOUND BEFORE YOU PARSE, and bound what you BUILD as well as what you READ. An input bound does not imply a conforming output: prefixes cost octets (`Subject: ` 9, `References: ` 12, `In-Reply-To: ` 13), and a bounded input still produced a 999-octet line. The rule is one rule applied at both ends.
- WP-audit-d-code-derived-recipients: MEASURE HEADER LINES IN UTF-8 OCTETS. RFC 5322 counts octets and the MIME builder encodes UTF-8, so a `.length` check passes a 1000-octet line — 329 `€` characters are 329 code units and 987 octets. Pick the unit the CONSUMER counts and say which consumer.
- WP-audit-d-code-derived-recipients: A NON-REPRODUCTION IS A CLAIM WITH THE SAME BURDEN AS A FINDING. Contradicting a reviewer on a measurement needs a correct run, not a run: nested shell quoting doubled every backslash, built a regex that failed fast on all input, and produced a flat "no super-linear growth" that was published as a disagreement. Put the gate in a FILE, quote once.
- WP-audit-d-code-derived-recipients: A GOVERNING RULE DOES NOT POLICE THE EXAMPLES BENEATH IT. A table's discipline paragraph forbade a mutation whose measured set exceeds its declaration, and the row seven lines above it did exactly that for six rounds. Only executing a row checks it against its own table's rule.
- WP-audit-d-code-derived-recipients: SELECTING AN EDIT TARGET BY A SUBSTRING THAT ALSO APPEARS IN PROSE is how a table row lands in the middle of a paragraph. An identifier-shaped match is not unique to the structure you meant; anchor on the whole block and assert the match is unique.
- WP-audit-d-code-derived-recipients: AFTER REPLACING A SECTION, RE-READ THE SECTION IT REPLACED. A wholesale rewrite silently dropped a deliberate non-claim, and no mirror checklist can catch it because the mirror WAS the section. The same rule as the intra-cell re-read, one level up.
- WP-audit-d-code-derived-recipients: a verification that ENUMERATES THE FORBIDDEN is unclosable; one that enumerates YOUR OWN INTENDED OBJECT is closable. V5 was wrong four times — over-strict, a denylist, names-only, gmail-only without a key/name tie — and every fix moved it further toward comparing the complete intended record. Enumerate the good.
- WP-audit-d-code-derived-recipients: THE PERMISSION BOUNDARY IS WORTH ITS FRICTION. Hitting an unlisted file, the implementer stopped and reported instead of regenerating it — turning a silently broken integrity anchor into one red PR and a five-minute architect edit.
- WP-audit-d-code-derived-recipients: RECORD A DIRECT OWNER RULING SEPARATELY from the ones dispatched under a standing instruction. Nine items went under "go with your recommendations"; the tenth the owner ruled in person after reading a brief. A tree should be able to tell those two apart years later, so the direct ruling gets its own dated record.
- WP-audit-d-code-derived-recipients: WRITE THE OWNER BRIEF TO BE DECIDED FROM A PHONE. Question in two sentences, what fired with its executed numbers, then options at three lines each with their costs and a stated recommendation. The loop had run six rounds; the ruling took one line.
