# ADR-0013: Vendored install — a stable app copy under the core, `sync` as the update command

Status: Accepted (amends ADR-0003 and ADR-0006)
Date: 2026-07-04

## Context

ADR-0003/0006 make `curl … | bash → npx wienerdog@latest init` the install path.
The OS scheduler entries Wienerdog writes (launchd plists, systemd units) embed
the **absolute path of the package copy that ran `schedule add`** — today
`src/scheduler/generators.js` `wienerdogBin()` returns
`path.resolve(__dirname, '..', '..', 'bin', 'wienerdog.js')`, the running copy.
Under the curl→npx flow that copy lives in the **npx cache**
(`~/.npm/_npx/<hash>/node_modules/wienerdog/`). Any `npm cache clean`, npx GC, or
version churn can delete or move it, silently stranding the nightly dream on a
path that no longer exists. The scheduler entry is long-lived; the npx cache is
ephemeral. That mismatch is the defect.

Hooks are already safe (they read `~/.wienerdog/state/*` and use `node` from
`PATH`; they never invoke the package bin), and `process.execPath` is a system
node binary, not the npx cache. The staleness is specifically the **package
bin path** embedded in schedules and in `run-job`'s self-invocations
(`builtin:dream`, `gws _alert`).

## Decision

Wienerdog **vendors its own package into the canonical core** and points every
long-lived reference at a stable entry path that survives version changes.

1. **Vendored tree.** `init`/`sync` copy the published `files` list
   (`bin/`, `src/`, `skills/`, `templates/`, `package.json` — **no
   `node_modules`**) from the running package root into
   `~/.wienerdog/app/<version>/`.
2. **Stable entry.** `~/.wienerdog/app/current` is a **symlink** to the active
   version dir, repointed **atomically** (write a temp symlink, `rename` over
   `current`). The stable bin is `~/.wienerdog/app/current/bin/wienerdog.js`.
   All scheduler entries, the catch-up entry, and `run-job`'s self-invocations
   target this stable path; only the symlink's target changes across versions,
   so plist/unit **content is version-independent** and idempotent.
3. **`sync` is the canonical update command.** `npx wienerdog@latest sync`
   vendors the newer version, atomically repoints `current`, idempotently
   repoints existing schedules to the stable entry, and refreshes managed
   blocks and the digest. It never auto-updates on its own.
4. **Dev mode.** When the running package root is a git checkout (a `.git`
   directory is present at the root) or `WIENERDOG_DEV=1` is set, Wienerdog does
   **not** copy a frozen snapshot: `current` points at the checkout root itself,
   so a developer's edits take effect for scheduled runs. This is how the
   dogfood repo runs.
5. **Manifest / uninstall.** The vendored tree is recorded as one manifest entry
   (`kind: 'vendored-tree'`, path `~/.wienerdog/app`); uninstall removes the
   whole `app/` subtree (all versions + the `current` symlink; in dev mode only
   the symlink — never the checkout).

## Consequences

- The nightly dream can no longer be stranded by npx-cache eviction: schedules
  point at a path Wienerdog owns and maintains under `~/.wienerdog/`.
- `zero runtime deps` becomes load-bearing: because the vendored copy carries no
  `node_modules`, only commands that need `googleapis` (`gws`) fail from it.
  `dream` and job dispatch need nothing beyond Node and work. **`run-job`'s
  best-effort fail-loud *email* (`gws _alert`) is not served by the vendored
  copy** and degrades to the durable `state/alerts.jsonl` channel (already the
  primary surface — ADR-0012). gws-using routines are unchanged: they run inside
  the brain (`claude -p`) via `wienerdog` on the brain's `PATH`, not via the
  vendored `run-job` process.
- Old version dirs accumulate under `app/` (each is tiny — published files
  only). Pruning to current + previous is a future nicety, out of scope now.
- **Windows-someday**: symlink creation needs privilege on Windows and
  scheduling is macOS/Linux-only today (`install.ps1` is M6–M7). When Windows
  scheduling lands it will use a directory junction or a pointer file for the
  stable entry; the POSIX symlink is the v1 mechanism and is recorded here as
  the decided approach for atomicity.
- `process.execPath` (the node absolute path also embedded in schedules) can
  still go stale for nvm users who delete a node version; that is a separate,
  lower-severity concern and is **out of scope** for this ADR.
- ADR-0004 is unchanged: vendoring copies files and repoints a symlink at
  install/update time; it starts nothing that outlives the job.
