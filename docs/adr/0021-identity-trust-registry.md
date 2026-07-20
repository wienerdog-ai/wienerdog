# ADR-0021: Human-ratified identity memory with an exact-byte trust registry

Status: Accepted
Date: 2026-07-17

## Context

The injected **digest** (`~/.wienerdog/state/digest.md`, rendered by
`src/core/digest.js`) bootstraps every new AI session. It is built from the four
injected **identity** files — `{identity_dir}/{profile,preferences,goals,
instructions}.md` (default dir `06-Identity/`) — so their bytes become standing,
instruction-adjacent context for the model.

The 2026-07-15 security audit (action A3 / risk R4) found that this authorization
was **self-asserted**: a hijacked nightly **dream** could write attacker
instructions into an identity file with real-looking provenance frontmatter
(`derived_from_untrusted: false`, `confidence: 0.9`, `recurrence: 3`) and have
them auto-activated into every future session. Re-deriving the numbers proves
sessions *exist*; it never proves the body text *follows* from them.

WP-112 (audit A0) already **froze** the dream from writing the four injected
identity files at all: `validateAndCommit` reverts any dream add/modify/delete of
them (the `identity-auto-activation` capability gate, BLOCKED). That closes R4's
direct path but leaves three gaps this ADR addresses:

1. **No tamper-evidence on the injected bytes.** Between the human setup that
   authored the identity files and the nightly render that injects them, nothing
   proves the bytes on disk are the ones a human authored. A scoped-write
   primitive, a crash mid-write, or accidental drift would be injected silently.
2. **No positive path to evolve identity.** With the dream frozen, a user who
   legitimately edits their identity has no audited way to make the change take
   effect in the digest.
3. **A case-folding path-identity hole (reviewer finding, WP-112).**
   `isInjectedIdentity` is case-sensitive; on a case-insensitive filesystem
   (macOS APFS default) a dream add of `06-Identity/Profile.md` routes to the
   ordinary Tier-3 numeric floor (bypassing the freeze branch), while the digest's
   literal `profile.md` read resolves to the *same inode* — a floor-passing
   case-variant could reach injection.

## Decision

Introduce a code-owned **identity trust registry** and gate the digest's identity
injection on an **exact-byte** hash match against it.

1. **The registry.** A 0600 JSON file `state/identity-approvals.json`, outside the
   brain's vault write surface (the core, not the vault), maps each injected
   identity file → `{approved_blob_hash, approved_at, source}`.
   - The key is the **case-folded** vault-relative path (`06-identity/profile.md`),
     so `Profile.md` and `profile.md` — the same inode on a case-insensitive FS —
     share one approval slot. This closes gap 3 on the read side.
   - `approved_blob_hash` = `sha256` of the file's **exact bytes**, with **NO
     normalization**: no case-folding of contents, no newline munging, no
     trimming, no Unicode normalization before hashing. (Recorded lesson: a
     case-folding step before hashing would make two different byte sequences
     collide and defeat tamper detection.) Path identity is case-folded; **content
     identity is byte-exact.**

2. **The digest gate.** `renderDigest` injects an injected-identity file **only
   when** the file's current exact-byte hash equals the registry's approved hash
   for that (case-folded) path. No record, or any mismatch → the file is **omitted
   and a fixed, secret-free alert is emitted** by the caller. Fail closed. A
   one-byte later change stops injection.

3. **Two — and only two — ways a hash enters the registry.**
   - **(a) First-time seed at attended `sync`.** For each present injected
     identity file that has **no** registry record yet, `wienerdog sync` records
     its current exact-byte hash with `source: 'setup'`. This bootstraps M2 (the
     human setup interview writes the four files; the first `sync` ratifies the
     bytes it finds). Justification: the dream can never write these files
     (WP-112 freeze), so the only author of first-seen identity bytes at sync time
     is the attended human setup. **This seed-on-first-attended-sync design is
     OWNER-APPROVED (2026-07-17)** — a settled decision, not an open question:
     requiring a manual approve before first use would degrade onboarding with no
     real security gain, given setup is attended and the dream is frozen from
     authoring these files.
   - **(b) `wienerdog memory approve <file>` — an interactive TTY-only ratification
     of the CURRENT on-disk bytes.** This is the sole way to **change** an
     already-seeded file's approved hash. It displays the exact changed bytes/diff
     and provenance, requires a typed-word confirmation read from a real
     controlling terminal, and has **no** headless / `--yes` / environment bypass
     (the `wienerdog grant` model, ADR-0007). On approval it records the new
     exact-byte hash with `source: 'approved'`.
   - **`sync` NEVER re-seeds a file that already has a record.** If a seeded file's
     bytes later change, `sync` leaves the old approved hash intact; the digest
     omits the file and alerts until a human ratifies the new bytes via `memory
     approve`. This is what makes tamper/drift detection real across syncs.

4. **The dream never seeds and never approves.** The nightly dream (unattended)
   only *reads* the registry and enforces the gate at its digest render; it can
   write neither identity files (WP-112 freeze) nor the registry. So a nightly
   corruption of an identity file fails closed against the registry established at
   the last attended sync/approval.

5. **Case-fold hardening on the write side too (defense in depth).**
   `isInjectedIdentity` (the WP-112 freeze predicate) is made case-insensitive so a
   dream add of `Profile.md` also hits the freeze branch, not just the read-side
   registry gate.

6. **Provenance is evidence, not authorization.** Frontmatter numbers
   (`confidence`, `recurrence`, `source_sessions`) may be re-derived and shown for
   the human's benefit, but they never authorize injection. Only an exact-byte
   registry match does. `instructions.md` and `goals.md` remain human-approved by
   the same mechanism.

## Boundary statement (what this does and does not defend)

This registry protects the **unattended digest-render path** between attended
human actions (`sync` / `memory approve`). It gives tamper-evidence against a
scoped write, accidental drift, or a crash, and it makes identity evolution
auditable. It is **not** a defense against arbitrary same-UID native code, which
can rewrite both the identity files and the registry (the audit's explicit
non-goal; see `docs/THREAT-MODEL.md` T0). Self-recorded hashes in an
attacker-writable core are drift detectors, not an OS security boundary — stated
here so no downstream doc overclaims.

## Consequences

- The digest stops injecting an identity file whose bytes do not match an approved
  hash. Existing pure `renderDigest(vault)` calls that supply no approvals inject
  no identity (fail closed); tests and the two production callers (`sync`,
  `dream`) supply the approvals map explicitly.
- A new user surface exists: `wienerdog memory approve`. It is the only model of
  identity change once a file is seeded.
- Implemented by **WP-116** (registry module + digest hash-gate + case-fold
  hardening + `sync` seeding) and **WP-117** (`wienerdog memory approve` CLI). The
  dream *emitting* non-injected proposals (audit A3 step 1's proposal-note
  materialization) is a separate future dream-skill WP; both WPs here work for the
  human-edit path without it.

## Alternatives considered

- **Trust frontmatter provenance (status quo).** Rejected by the audit: brain-
  authored metadata is forgeable; three real session ids next to malicious text
  still pass.
- **Fail-open when a caller omits the approvals map** (mirror `opts.alerts`).
  Rejected: a future third caller of `renderDigest` would silently bypass the
  gate. Absent approvals → no identity injected (fail closed), matching WP-109's
  fail-closed-on-absence precedent.
- **Auto-re-seed any bytes present at every sync.** Rejected: it would let a
  post-setup tamper become approved merely by running `sync`. Seeding is
  first-time-only; changes require explicit `memory approve`.
- **Case-fold the bytes before hashing** (to make the registry case-insensitive).
  Rejected: normalization before hashing collides distinct byte sequences and
  destroys tamper precision. Path identity is folded; content identity is exact.

## Amendments

### Amendment 1 (2026-07-20) — `seedApprovals` auto-seed is coupled to the `identity-auto-activation` gate

The 0.10.0 un-freeze opens `identity-auto-activation` (the dream may now edit
identity files; `validate.js` no longer reverts them). That **breaks the premise**
of Decision.3(a)'s seed-on-first-attended-sync convenience. The pre-takeover
double-gate review PoC-proved the resulting hole (finding I-1): `seedApprovals`
records `source:'setup'` for ANY injected identity file lacking a record — with no
TTY, no bytes shown. This was sound ONLY because the WP-112 freeze guaranteed the
dream could never author these files. With the gate open, two paths escalate:
**(a)** the dream writes a **first-appearance** identity file setup never created →
the next `sync` auto-seeds the dream's bytes trusted; **(b)** **registry loss**
(`readRegistry` → `{approvals:{}}`) makes the next `sync` re-seed ALL FOUR from
current (possibly dream-modified) bytes — the documented "fail closed" becomes
fail-OPEN.

**Resolution: `seedApprovals` auto-seed is gate-coupled.** It records
`source:'setup'` bytes with no TTY **only while `identity-auto-activation` is
BLOCKED** (the dream provably cannot have authored the files). When the gate is
ALLOWED, `seedApprovals` writes nothing; every first-appearance / post-loss /
changed injected identity file is ratified through the TTY `wienerdog memory
approve` path (`recordApproval`, WP-117 — **not** gate-coupled; it is the human
ratification path and works regardless of the gate). This closes both bypasses:
unrecorded/dream-authored bytes are never auto-trusted once the gate is open; a lost
registry re-seeds nothing (all four fail closed until re-approved).

**Also (write-side case hardening, defense in depth):** `validate.js`'s `isTier3`
identity-dir prefix match is made **case-insensitive** (mirroring the already
case-insensitive `isInjectedIdentity`), so a dream write to a case-variant
identity path (`06-identity/profile.md` on a case-insensitive FS) still hits the
freeze branch while the gate is blocked.

**This supersedes Decision.3(a)'s "OWNER-APPROVED seed-on-first-attended-sync" for
the un-gated posture.** That decision stands ONLY while `identity-auto-activation`
is blocked. **Accepted residual:** with the gate open, a fresh/adopting user's four
identity notes are not auto-seeded at first sync; the digest's identity-exclusion
banner guides the user to ratify each via `memory approve`. A `memory approve --all`
convenience and/or seeding at the attended, code-owned setup/adopt authorship moment
(pre-dream, provably human-authored) is a deferred enhancement if the onboarding
friction proves unacceptable. Implemented by **WP-identity-seed-gate-couple**.
