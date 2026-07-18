---
date: 2026-07-12
title: Codex adversarial audit of foundational code
related_wps: [WP-048, WP-069, WP-075, WP-080, WP-085, WP-086, WP-087, WP-088, WP-089, WP-090, WP-091, WP-092, WP-093, WP-094, WP-095, WP-096, WP-097, WP-098, WP-099]
---

# Codex adversarial audit of foundational code (2026-07-12)

**Codex adversarial audit of foundational code (2026-07-12, WP-085→099).** Six
read-only Codex reviews of already-merged foundational code (installer core,
dream, gws, installers, adapters, scheduler) were triaged, verified against
current code + prior Done WPs, and turned into fifteen Draft WPs grouped by code
region (repo norm: small, single-region WPs; chain only where files are shared).
Findings already closed by prior WPs were dropped (scheduler primary-mutation
fail-loud is WP-075; dream lock/watermark is WP-069; WP-080's `rebaseInvocations`
is reused by WP-087). **Tier 1 (security-critical, land first):** **WP-085**
rejects CR/LF in Gmail MIME header fields — the subject-based header-injection
that smuggled a `Bcc:` past the ADR-0007 send-grant allowlist (also fixes the
`_alert` "fixed-template" claim); **WP-086** hardens the send-grant boundary — the
`grant` CLI now requires a real terminal (a piped `printf 'grant' |` could mint a
grant headlessly) and `isSendAllowed` fails closed on an empty recipient list;
**WP-087** rebases `skill_invocations` indices when a dream extract is
byte-budget-truncated (the WP-048 path never got WP-080's cap-path rebase, so a
padded session could mis-window an invocation and treat an untrusted learning as
trusted — ADR-0020 bypass). WP-085/086/087 are independent and parallel.
**Tier 2 (reversibility / robustness):** **WP-089** (shared.js + manifest.js) stops
`applySkillLinks` recursively deleting a directory in the `wienerdog-*` namespace on
content drift with **no ownership proof** (the destroy-user-edits P0). It records a
raw-byte, length-framed, node-type-tagged sha256 tree fingerprint (`hashDir`,
defined once and exported from `manifest.js`) on each `copied-skill` entry, and
refreshes a namespace directory only when its on-disk fingerprint still equals the
hash WE recorded for that exact path (proof it is our own unmodified copy) —
otherwise it is left untouched with a notice, never `rmSync`+recopied. This keeps
auto-refresh working for our own copies across version bumps while never deleting a
directory that is not provably ours. **WP-088** (manifest.js + uninstall.js) defers a
**deferred-deletion set** — the uninstall manifest, the core dir, AND config.yaml —
deleting them LAST in `uninstall.js`, only after BOTH the reversal loop and the
mechanics sweep succeed (round-2 fix: end-of-`reverse()` was insufficient; 2026-07-13
redesign added config.yaml after a P1 where deleting it early made a retry lose the
nested-vault path and recursively delete the user's nested vault — manifest is now
deleted BEFORE config.yaml so "manifest-present ⟹ config-present" holds at every crash
point, and a matching P1 where `reverse()` rmdir'd the core → ENOTEMPTY wedged the
retry). It also generalizes the config-only per-FILE `sha256File` hash-guard so any hashed file
modified since install is preserved not deleted (un-hashed shims/hooks remain a
follow-up), contains vendored-tree removal to the app root `core/app` (rejecting the
equal-to-`core` P0), and contains copied-skill removal to the harness skills root +
`wienerdog-*` namespace, deleting a copied skill **only if its on-disk tree still
fingerprints (via WP-089's exported `hashDir`) to the `hash` recorded on the
`copied-skill` entry** — a hash-less/legacy entry, a fingerprint mismatch, or an
unreadable tree (`hashDir` → `null`) is preserved with a notice (round-2 fix: NOT
core-containment, which lives outside the core). The shared, exported `hashDir` means
the forward recorder (WP-089) and the reverse checker (WP-088) use one identical
serializer, so a copy adopted on the forward path is the same object the reverse path
agrees to delete. The fingerprint took rounds 3/5/7/8/9 of adversarial review to
harden against serialization collisions (partial framing, invalid-UTF-8 folding,
file→symlink node-type swaps, fail-open on unreadable subtrees, raw-byte name
collisions) and was verified Codex-clean at round 10. **A "compare-to-live-source"
simplification (drop `hashDir`, use a live `dirsEqual(source, on-disk)` instead) was
evaluated and REJECTED (2026-07-12):** `dirsEqual` re-opened the file↔symlink/special
node-type collision, failed OPEN on unreadable trees, and on the reverse path
introduced a manifest-ordering false-delete (a historical `copied-skill` entry sits
before newer staged-skill entries, so `reverse()` could prune the live source before
comparing and delete an edited user copy) while relaxing the "leave only the vault"
guarantee. Because both WPs share `manifest.js` (WP-089 defines+exports `hashDir`;
WP-088 calls it and reads the `hash` field WP-089 writes), **WP-088 `depends_on:
[WP-089]`.** **WP-090** shell-quotes hook command paths (space/metachar install paths
broke every hook) — depends WP-089 (shared `shared.js`); **WP-091** anchors
managed-block sentinels to full lines and fails closed on ambiguous markers
(substring `indexOf` could swallow user prose) — depends WP-088 + WP-090 (shared
`manifest.js`/`shared.js`); **WP-092** stops `init` chmod-ing a pre-existing
`secrets/`; **WP-093** hardens the JS tarball install (mkdtemp+0600+`wx` temp,
`tar -tzf` member-name preflight, a `.wienerdog-complete` marker replacing the
lone-`bin/wienerdog.js` completeness shortcut). WP-092/093 are independent; the
shared-file chains are `shared.js`: WP-089 → WP-090 → WP-091, and `manifest.js`:
WP-089 → WP-088 → WP-091 (WP-091 sequences after WP-088 + WP-090).
**Tier 3 (lower-priority hardening):** **WP-094** (install.sh) pins curl to HTTPS
(`--proto`), shows the exact Node `.pkg` URL before consent, and REMOVES the
`WIENERDOG_TTY` env seam entirely (round-2: an env override — even marker-gated —
stays attacker-settable; production reads only `/dev/tty`, tests redefine a sourced
`tty_dev` function); **WP-095** realpath-resolves the vault AND home (matching
domains) before the TCC guard (a symlinked vault — or a symlinked home component —
reintroduced the unattended-hang class); **WP-096** bounds `alerts.jsonl` growth by
record-count AND bytes, caps field sizes, and null-guards the sanitizer against
valid-JSON primitives; **WP-097** XML-escapes launchd plist values and quotes +
`%`-escapes (`%%`) systemd ExecStart paths; **WP-098** surfaces best-effort
systemd-call (`daemon-reload`/`enable-linger`) failures (incl. missing results) and
makes `schedule remove` report truthfully (no unverifiable "unloaded" claim);
**WP-099** (install.ps1) requires the Git-for-Windows asset URL to be HTTPS on
`github.com` under the official release path AND validates the final redirected URI
before download. Accepted residuals NOT spec'd (still match THREAT-MODEL "Residual
risks"): dream Tier-3 frontmatter trust, skill-registry non-cryptographic
tamper-proofing, config.yaml-writable grants / exported `saveGrant` convention
boundary, symlink/hardlink tar-member defense (needs a cross-tar research spike),
and Windows self-run-while-elevated (accepted under ADR-0017). All fifteen are
**Draft** pending a Codex round-2 review before Ready.
