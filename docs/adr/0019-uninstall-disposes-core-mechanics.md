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

> **Narrowed by the amendment at the end of this file (2026-09-19):** the secret
> quarantine (`state/quarantine/**`) is an exception to this invariant, and was
> already one in the shipped tree when the paragraph above was written.

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

## Amendment (2026-09-19) — the secret quarantine is a preserved kind, and the invariant is narrowed to what the core already holds

Status: **ACCEPTED under standing authorization 2026-09-18 — owner-signed 2026-09-26**

**Erratum first, because the invariant above describes an intention rather than
a property of the tree.** *"Nothing user-authored is ever written under the
canonical core"* has been **false in the shipped product since WP-123**, and no
amendment recorded it. `quarantinePreserve` (`src/core/dream/validate.js`)
writes the user's own note bytes under the core at two paths:
`state/quarantine/`, for a note the staged-output secret gate withheld, and
`state/quarantine/redacted/`, for the pre-scrub original of a note the gate
rewrote and committed (`WP-secret-fence-ep2-redact-arm`). Both hold the raw,
unredacted text, and `disposeCoreMechanics` has been deleting it recursively
with no warning naming it.

**What is narrowed.** The invariant now reads: *nothing user-authored is
written under the canonical core **except the secret quarantine**, which is the
one place the product deliberately sets the user's own bytes aside, and which
no disposal step may remove.* Everything else in the Decision above stands
unchanged.

**The preserved kind is realized in code, not in the manifest.** The
Consequences above offer two routes — write to the vault, "or be added to the
manifest as a preserved kind". The **vault** route is refused because the vault
is a git repository that may be synced or backed up, and keeping raw
secret-bearing bytes out of it is the gate's entire purpose. The **manifest**
route is refused because it would make the dream gate — the most
attacker-adjacent code in the product — a writer of `install-manifest.json`,
the one file that drives every uninstall deletion, and would put the survival
of the user's text at the mercy of a plaintext, attacker-writable file that
ADR-0038 explicitly does not authenticate; stripping one entry would restore
today's silent destruction with nothing to detect it. The preservation is
therefore a rule inside `disposeCoreMechanics` itself, taking no argument, that
no caller and no file on disk can switch off. Both routes only ever make
uninstall delete **less**, so ADR-0038's narrowing rule permits either and
chooses neither; the grounds above are what chooses.

**`secrets/` is NOT carved out, and the distinction is the whole criterion.**
The Decision above deletes the Google OAuth token because it is
**re-obtainable** — `/wienerdog-google-setup` mints a new one, and leaving the
old one stranded is its own hazard. A quarantined note is re-obtainable from
nowhere: the vault holds either the scrubbed form or the pre-gate baseline, and
the transcript it came from is outside Wienerdog's control and may already be
gone. **Re-obtainability, not sensitivity, is what decides whether uninstall
may destroy a thing.** By that test `secrets/`, `logs/`, `schedules/` and the
rest of `state/` all stay disposable, and this amendment changes none of them.

**What uninstall does instead.** `wienerdog uninstall` **stops before removing
anything** while either quarantine directory holds a file, or while their state
cannot be determined. It prints how many files and how many bytes are there and
where they are, says that some or all of them may be the only copy of that text
on the computer, and tells the user to move them somewhere they keep or delete
them and run the command again. It behaves identically with `--yes`, because
`--yes` skips the prompt and a refusal is not a prompt. **Wienerdog writes no
copy of its own:** an export would create a new, unmanaged pile of unredacted
credentials in the user's home — outside the core, outside the manifest,
unknown to every future run and removable by no uninstall — which is the
accidental-persistence outcome ADR-0034 exists to prevent, performed as the
last act of a command the user ran to remove the product.

**What this costs the M7 release gate**, stated rather than left to inference.
*"install → use → uninstall leaves only the vault"* still holds for every
uninstall that **completes**, because a completing uninstall is one whose
quarantine was already empty. What changes is that an install holding
unreviewed quarantined copies now has an uninstall that **refuses** until the
user deals with them, instead of one that completes by destroying them.

**ADR-0004 is intact.** This is a deletion that stops happening and a message
that starts. Nothing is started that outlives the command.
