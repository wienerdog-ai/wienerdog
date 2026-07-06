# ADR-0019: Uninstall disposes the canonical core's machine-generated mechanics

Status: Accepted
Date: 2026-07-06

## Context

`wienerdog uninstall` replays the install manifest in reverse, removing exactly
what the installer wrote. The manifest, however, only tracks files the installer
*authored at install/sync time*. It does **not** track the runtime artifacts
Wienerdog generates while running: `state/digest.md`, `state/watermarks.json`,
`state/alerts.jsonl`, `state/update-check.json`, `state/schedule.json`,
`state/scratch/**` (all machine mechanics), `logs/**` (run-job logs),
`schedules/*.xml` (Windows Task Scheduler artifacts), and `secrets/google-token.json`
/ `secrets/google-client.json` (OAuth credentials, written by `src/gws/client.js`
with **no** manifest record — verified 2026-07-06).

Because `manifest.reverse()`'s `dir` handler only removes *empty* directories,
each of these subdirs is left behind non-empty, which in turn keeps the enclosing
core dir (`~/.wienerdog`) alive. A real Windows field uninstall (v0.6.0) surfaced
exactly this: `state/digest.md` and the `schedules/` dir survived and orphaned
`~/.wienerdog`. The M7 acceptance criterion — *"install → use → uninstall leaves
only the vault"* — is therefore not met for any install that has been synced,
run a routine, connected Google, or scheduled the dream.

The **vault** (`~/wienerdog`, or an adopted vault) is the sole user treasure and
is preserved by design (its files are recorded under `vault-file` / `vault-dir`
kinds that reverse intentionally skips). The vault is **never** inside the
canonical core by construction: the core is `~/.wienerdog`; the vault default is
`~/wienerdog`; an adopted vault is an arbitrary path the user chose, which
`adopt` refuses to place inside the core. Everything under the core is
Wienerdog-authored disposable mechanics (GLOSSARY: "canonical core … source of
truth for *mechanics* (not user knowledge)").

## Decision

`uninstall`, after replaying the manifest, **recursively removes the core's
machine-generated-mechanics subdirectories** — `state/`, `logs/`, `schedules/`,
and `secrets/` — and then removes the now-empty canonical core directory itself.

The sole documented exception is a **user-modified `config.yaml`**: `reverse()`
already keeps it (recorded-hash mismatch = "user edited this"), and when it is
kept the core dir is left alive to hold it. An unmodified install thus leaves
*only the vault*; a config-customized install leaves the vault plus
`~/.wienerdog/config.yaml`.

Removing `secrets/` deletes the Google OAuth token on uninstall. This is
intended: the token is a Wienerdog-created, disposable credential re-obtainable
via `/wienerdog-google-setup`, and leaving it orphaned would both violate the
leave-only-the-vault criterion and strand a live credential on disk.

The invariant this rests on — **nothing user-authored is ever written under the
canonical core; the vault is always outside it** — is binding on all future
code. No WP may write user knowledge under `~/.wienerdog`.

## Consequences

- `uninstall` now genuinely leaves only the vault (plus a deliberately-kept
  edited `config.yaml`); the M7 criterion is verifiable end-to-end.
- A dedicated, separately-tested disposal step (`disposeCoreMechanics`) runs
  *after* the manifest replay, keeping `reverse()` a pure manifest operation.
- The disposal is a blunt recursive delete scoped to four fixed subdirs — it is
  safe only while the core-holds-only-mechanics invariant holds. Any future
  feature tempted to persist user content under the core must instead write to
  the vault (or be added to the manifest as a preserved kind).
- OAuth tokens do not survive uninstall; a reinstall re-runs Google setup.
- IRON RULE (ADR-0004) intact: this is deletion of files, not a process.
- `--dry-run` must disclose the recursive core cleanup plainly, preserving the
  M1 dry-run-exactness guarantee.

> Amendment (2026-07-06, from the WP-068 review): the "provably safe" premise
> was corrected — the vault-outside-core invariant is now ENFORCED (adopt
> rejects vault paths inside the core) AND independently guarded in
> `disposeCoreMechanics` (realpath containment check; a mechanics dir holding
> the vault is skipped with an honest summary instead of the standard
> reassurance). Load-bearing subtlety: `init` records a `dir` manifest entry
> only for a core it CREATES — a pre-existing symlinked core is never recorded,
> which is why `reverse()`'s rmdir-on-dir-entry never meets a symlink. A future
> change that records the core dir unconditionally would reintroduce that
> crash; don't.
