---
id: WP-089
title: Adapter skill-dir ownership — never recursively delete a user directory in the wienerdog-* namespace (content-fingerprint guard)
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0019]
branch: wp/089-adapter-skill-dir-ownership
---

# WP-089: Adapter skill-dir ownership guard (fingerprint before refresh)

## Context (read this, nothing else)

Wienerdog registers its `/wienerdog-*` skills into each harness by linking (or, on
Windows without symlink permission, **copying**) each core skill folder into the
harness's skills directory. This is done by `applySkillLinks`
(`src/adapters/shared.js`), the shared choke point both the Claude and Codex
adapters call. A copied folder is tracked in the install manifest as
`kind:'copied-skill'` so uninstall can reverse it.

Wienerdog's install invariant is **managed-only, non-destructive**: it never
overwrites or deletes user content that it did not create (THREAT-MODEL T5). The
**verified defect (P0):** when `applySkillLinks` finds an existing **directory**
at the target `wienerdog-<name>` path whose contents differ from the source, it
unconditionally `fs.rmSync(linkPath, { recursive: true })` and replaces it — with
**no** proof that Wienerdog created that directory. A user (or another tool) who
happens to have a directory named `wienerdog-notes` (or who hand-created a skill
in that namespace) has it recursively **deleted**. The regular-file branch a few
lines below already does the right thing (leaves an unknown user file untouched
with a notice); the directory branch must gain the same ownership proof.

**Fix: prove ownership with a recorded content fingerprint before any destructive
refresh.** On copy, record the copied tree's `hashDir` fingerprint on the
`copied-skill` manifest entry. On a later `sync`, refresh the directory **only
when the on-disk tree still fingerprints to the value WE recorded** (proof it is
our own unmodified copy):

- **ABSENT** → copy it in and record `{kind:'copied-skill', path, hash}` where
  `hash = hashDir(linkPath)`.
- **on-disk fingerprint == the recorded `hash`** → it is our own untouched copy →
  safe to refresh to the current packaged source (`rmSync`+`cpSync`), then
  re-record the new source fingerprint. If the source is unchanged, no write —
  report `unchanged` and re-record idempotently.
- **on-disk fingerprint != the recorded `hash`, OR there is no recorded hash
  (a legacy entry, or a user's own pre-existing directory we never recorded)** →
  it is **not provably ours** → **PRESERVE it untouched with a notice.** Do
  **not** `rmSync`+recopy.

This replaces the unconditional `rmSync`-on-drift (the destroy-user-edits bug)
with a fingerprint-gated refresh. Because ownership is proven against a value WE
recorded for THIS on-disk object — not merely against a matching manifest path —
a directory that is not, byte-for-byte, our own recorded copy is never deleted.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
this is synchronous filesystem code invoked by `sync`. Non-destructive install is
absolute — a directory in the namespace that is not provably our own copy is left
alone, not clobbered.

## Current state

`src/adapters/shared.js` `applySkillLinks(skillsDir, targetSkillsDir, dryRun,
manifest, out, opts)` iterates candidate `wienerdog-*` names. `target =
path.join(skillsDir, name)` is the packaged **source** skill dir (staged into
`<core>/skills/<name>`); `linkPath = path.join(targetSkillsDir, name)` is the
harness-side path. Per name it `lstat`s `linkPath` and branches. The **directory**
branch (`shared.js:306-317`) is the P0:

```js
} else if (stat !== null && stat.isDirectory()) {
  // A prior copy in the wienerdog-* namespace — refresh if content differs.
  if (dirsEqual(target, linkPath)) {
    out.unchanged.push(linkPath);
  } else {
    if (!dryRun) {
      fs.rmSync(linkPath, { recursive: true, force: true });   // ← deletes a user dir with no ownership proof
      fs.cpSync(target, linkPath, { recursive: true });
    }
    out.changed.push(linkPath);
  }
  recordOnce(manifest, { kind: 'copied-skill', path: linkPath });
} else if (stat !== null) {
  // Regular file the user owns — never clobber.               ← the intent to mirror
  out.notices.push(`left user file untouched: ${linkPath}`);
}
```

`recordOnce(manifest, entry)` (`shared.js:15`) appends a manifest entry only if
none with the same `kind`+`path` already exists — it **no-ops on a duplicate**, so
it cannot UPDATE a recorded hash; this WP adds an upsert helper for that.
`dirsEqual(a, b)` (`shared.js:217`) is a pure tree-byte-comparison helper; it is
**not used** by this WP's directory branch anymore and is left untouched (other
branches/tests still reference it — do not delete it). `out.notices` is the
existing channel for "left something alone" messages (rendered by the caller).
The absent-path branch (`shared.js:326-338`) copies via `fs.cpSync` on
`EPERM`/`EACCES` and today records `{kind:'copied-skill', path: linkPath}` with no
hash — this WP changes that one record call to carry the fingerprint.

`src/core/manifest.js` imports `fs`, `path`, `crypto` (verified at
`manifest.js:1-5`) and exports its helpers via `module.exports` (`manifest.js:463`).
It has a single-file hash helper `sha256File` (`manifest.js:64`) but **no** whole-
tree fingerprint. The `ManifestEntry` typedef (`manifest.js:37`) already allows an
optional `hash?: string`, so `{kind:'copied-skill', path, hash}` needs **no**
typedef change.

`shared.js` imports only `fs` and `path` today (`shared.js:3-4`); this WP adds
`const { hashDir } = require('../core/manifest');` (adapters depend on core — the
correct dependency direction; no cycle: `manifest.js` does not require any
adapter).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | Add and export ONE pure `hashDir(root)` — the raw-byte, length-framed, node-type-tagged sha256 tree fingerprint that returns `null` on any read/traversal error (fail closed). Add it to `module.exports`. NO other change to `manifest.js` in this WP (the reverse-side changes are WP-088). |
| modify | src/adapters/shared.js | Import `hashDir` from `../core/manifest`; add a local, NON-exported `recordCopiedSkill(manifest, linkPath, hash)` UPSERT helper next to `recordOnce`; rewrite the `applySkillLinks` **directory branch** to refresh only when `hashDir(linkPath) === the recorded copied-skill hash` (else preserve with a notice); change the absent-path copy fallback's record call to `recordCopiedSkill(manifest, linkPath, hashDir(linkPath))`. Do NOT touch `dirsEqual`, `recordOnce`, the symlink branch, or the regular-file branch. |
| modify | tests/unit/manifest.test.js | `hashDir` unit + adversarial tests (see Acceptance criteria): determinism; null on unreadable; the collision pairs; node-type distinctions; raw-byte name distinction. |
| modify | tests/unit/shared-skill-links.test.js | Forward-path tests: absent→copy records `{kind,path,hash}`; matching-fingerprint refresh (source unchanged → `unchanged`+re-record; source changed → `changed`+re-record new hash); mismatched fingerprint and legacy hash-less entry both PRESERVE (no `rmSync`/`cpSync`, notice, not adopted); symlink and regular-file branches unchanged. |

### Exact contracts

**(1) `hashDir` — defined ONCE in `src/core/manifest.js`, exported.**
`crypto`, `fs`, `path` are already imported there. Add verbatim:

```js
/** Deterministic sha256 fingerprint of a directory tree, over RAW BYTES.
 *  Every field is length-framed; node type is a 1-byte tag (d/f/l/s) from the
 *  Dirent (lstat semantics — never dereferenced). Any traversal/read error →
 *  return null (fail closed; null can never equal a recorded string hash).
 *  @param {string} root @returns {string|null} hex digest, or null if unreadable */
function hashDir(root) {
  const h = crypto.createHash('sha256');
  const SEP = Buffer.from('/'); // 0x2F — path join AND framed-path separator (raw byte)
  const walk = (dirBuf, prefixBuf) => {
    const ents = fs.readdirSync(dirBuf, { withFileTypes: true, encoding: 'buffer' });
    ents.sort((x, y) => Buffer.compare(x.name, y.name)); // deterministic byte-wise order
    for (const e of ents) {
      const nameBuf = e.name;                                  // RAW entry-name bytes (Buffer)
      const rpBuf = prefixBuf ? Buffer.concat([prefixBuf, SEP, nameBuf]) : nameBuf;
      const fullBuf = Buffer.concat([dirBuf, SEP, nameBuf]);   // Buffer path for on-disk reads
      if (e.isDirectory()) {
        h.update('d'); h.update(`${rpBuf.length}:`); h.update(rpBuf); walk(fullBuf, rpBuf);
      } else if (e.isFile()) {
        const dataBuf = fs.readFileSync(fullBuf);
        h.update('f'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
        h.update(`${dataBuf.length}:`); h.update(dataBuf);
      } else if (e.isSymbolicLink()) {
        const linkBuf = fs.readlinkSync(fullBuf, { encoding: 'buffer' });
        h.update('l'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
        h.update(`${linkBuf.length}:`); h.update(linkBuf);
      } else {
        h.update('s'); h.update(`${rpBuf.length}:`); h.update(rpBuf);
      }
    }
  };
  try { walk(Buffer.from(root), null); } catch { return null; }
  return h.digest('hex');
}
```

Add `hashDir` to `manifest.js`'s `module.exports`. The design is **injective** by
construction and every branch is exercised by the tests:
- **Decimal length-framing** (`${len}:` before every raw payload) is unambiguous
  even when a payload begins with a digit or contains `:` — the first `:`
  terminates the decimal token and the declared byte count fixes the boundary, so
  a boundary can never shift into or out of payload bytes.
- **A tag is never consumed as a prior field's last byte:** empty files and empty
  link targets still emit a `0:` content section; directories have no content
  section; and the four tags `d`/`f`/`l`/`s` separate the node categories.
- **Inlined children cannot masquerade as root siblings:** every node carries its
  full raw relative path, joined by `/` (`0x2F`) — a byte forbidden inside a single
  filename — so `x/y` can never be emitted by a root-sibling filename.
- **Raw Buffers throughout** enumeration, sorting (`Buffer.compare`), path framing,
  and symlink-target framing — no UTF-8 round-trip, so invalid-byte names cannot
  fold together (`0x80` vs `0x81` differ).
- **Fail closed:** any `readdirSync`/`readFileSync`/`readlinkSync` throw reaches the
  single outer `catch` and returns `null`; the hash object is never digested on
  that path, so neither a partial digest nor an empty string can leak. `null` can
  never `===` a recorded hex-string hash — the fail-safe direction on every caller.

**(2) `recordCopiedSkill` — local UPSERT helper in `shared.js` (NOT exported).**
`recordOnce` refuses to touch an existing same-kind+path entry, so it cannot
refresh a hash. Add, next to `recordOnce`:

```js
/** Record — or UPSERT — a copied-skill manifest entry, refreshing its content
 *  fingerprint. Unlike recordOnce (which no-ops when a same-kind+path entry
 *  exists), this updates the recorded `hash` so a legitimately refreshed copy
 *  carries its CURRENT fingerprint. When `hash` is null (hashDir could not read
 *  the tree) the entry is recorded WITHOUT a `hash` field — NEVER persist null/''
 *  (a hash-less entry is treated as unverifiable → preserved, the safe direction).
 *  @param {object} [manifest] @param {string} linkPath @param {string|null} hash */
function recordCopiedSkill(manifest, linkPath, hash) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const existing = manifest.entries.find(
    (e) => e.kind === 'copied-skill' && e.path === linkPath
  );
  const entry = existing || { kind: 'copied-skill', path: linkPath };
  if (typeof hash === 'string') entry.hash = hash;
  else delete entry.hash;
  if (!existing) manifest.entries.push(entry);
}
```

**(3) Directory branch — fingerprint before refresh.** Replace the current
`isDirectory()` branch with:

```js
} else if (stat !== null && stat.isDirectory()) {
  // A directory in the wienerdog-* namespace. Refresh it ONLY when its on-disk
  // fingerprint still matches the hash WE recorded for it (proof it is our own
  // unmodified copy). A mismatch — the user edited/replaced it — or a directory
  // we never recorded (a pre-existing user dir; a legacy hash-less entry) is NOT
  // provably ours, so PRESERVE it untouched with a notice; NEVER rmSync+recopy
  // (that was the destroy-user-edits P0).
  const recorded =
    manifest && Array.isArray(manifest.entries)
      ? manifest.entries.find((e) => e.kind === 'copied-skill' && e.path === linkPath)
      : null;
  const onDisk = hashDir(linkPath);
  if (recorded && typeof recorded.hash === 'string' && onDisk !== null && onDisk === recorded.hash) {
    // Provably our own unmodified copy → converge it to the current source.
    const sourceHash = hashDir(target);
    if (sourceHash !== null && sourceHash !== onDisk) {
      if (!dryRun) {
        fs.rmSync(linkPath, { recursive: true, force: true });
        fs.cpSync(target, linkPath, { recursive: true });
      }
      out.changed.push(linkPath);
      recordCopiedSkill(manifest, linkPath, sourceHash);
    } else {
      // Source unchanged (or momentarily unreadable) → leave our copy in place.
      out.unchanged.push(linkPath);
      recordCopiedSkill(manifest, linkPath, onDisk);
    }
  } else {
    out.notices.push(
      `left skill directory untouched (not a recorded Wienerdog copy, or modified since — delete it to let sync re-copy): ${linkPath}`
    );
  }
}
```

**(4) Absent-path copy fallback — record the fingerprint.** In the `EPERM`/`EACCES`
copy branch, change the record call so the entry carries the fingerprint:

```js
fs.cpSync(target, linkPath, { recursive: true });
recordCopiedSkill(manifest, linkPath, hashDir(linkPath));
```

Behavior:
- **First-ever copy (target absent)** → copies, records `{kind:'copied-skill', path,
  hash}` with the freshly-copied tree's fingerprint.
- **A later `sync` on our unchanged copy** → `hashDir(linkPath) === recorded.hash`
  and the source is unchanged → no write, `unchanged`, hash re-recorded idempotently.
- **A version bump changed the packaged source** → `hashDir(linkPath)` still equals
  the recorded hash (the user did not touch our copy) → refresh to the new source,
  `changed`, re-record the new source fingerprint. (The fingerprint scheme keeps
  auto-refresh working for OUR copies across upgrades.)
- **The user edited our copy** → `hashDir(linkPath) !== recorded.hash` → preserved
  with the notice; not deleted, not recorded anew.
- **A user's pre-existing `wienerdog-foo/`** we never recorded → no recorded entry
  (or a hash-less legacy one) → preserved with the notice; never adopted, never
  deleted.
- **The symlink and regular-file branches are unchanged.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- `hashDir` is defined **once**, in `manifest.js`, and **exported** — WP-088's
  reverse-side ownership check re-uses the SAME function (its dependency on this
  WP). Do NOT define a second copy in `shared.js`; import it. A single serializer
  guarantees the forward recorder and the reverse checker agree byte-for-byte.
- The `copied-skill` entry shape becomes `{kind:'copied-skill', path, hash}`. The
  `hash?: string` field already exists on the `ManifestEntry` typedef — no typedef
  change. WP-088 reads `entry.hash` from exactly this entry.
- Never persist a `null`/`''` hash — `recordCopiedSkill` omits the field. A
  hash-less entry is unverifiable and is therefore **preserved** on both the
  forward refresh and the reverse delete (fail-safe).
- Keep the change surgical: the only `shared.js` behavior changes are the new
  import, `recordCopiedSkill`, the directory branch body, and the one record call
  in the absent-path fallback. Do not modify `dirsEqual` (unused here but still
  referenced elsewhere), `recordOnce`, the symlink branch, or the regular-file branch.
- `manifest` may be `undefined` in a dry run without a manifest; `recordCopiedSkill`
  guards `if (!manifest) return`, and the `recorded` lookup guards on
  `Array.isArray(manifest.entries)`, so the branch is safe with no manifest.
- The `out.notices` string is user-facing plain language (CLAUDE.md): it names the
  path and the one-step recovery ("delete it to let sync re-copy").

## Security checklist

- [ ] A directory in the `wienerdog-*` namespace is recursively removed by
      `applySkillLinks` **only** when its on-disk `hashDir` fingerprint equals the
      hash WE recorded for that exact path (proof it is our own unmodified copy),
      and even then only via `rmSync`+`cpSync` to converge it to the current source.
      A directory whose fingerprint differs, or that has no recorded hash (a user's
      own directory, a hand-edited copy, or a legacy entry), is left byte-for-byte
      intact with a notice — the unconditional destroy-user-edits `rmSync` is gone.
- [ ] The recorded fingerprint is computed by the single exported `hashDir`; the
      reverse path (WP-088) verifies against the SAME serializer, so there is no
      recorder/checker divergence.
- [ ] `hashDir` fails closed: any read/traversal error returns `null`, which can
      never `===` a recorded hex string, so an unreadable tree is never treated as a
      match (neither refreshed nor, in WP-088, deleted).
- [ ] The fingerprint is injective by construction — decimal length-framing,
      per-node type tags, full raw-byte relative paths joined by the forbidden `/`
      byte, raw Buffers end-to-end — so no two structurally distinct trees collide
      (the round-hardened collision classes are all closed; see Acceptance criteria).

## Acceptance criteria

`hashDir` (in `tests/unit/manifest.test.js`):

- [ ] Deterministic: two identical trees built independently hash equal; a
      one-byte file-content change changes the hash.
- [ ] Returns `null` for a non-existent root and for an unreadable subtree; a tree
      containing an unreadable subtree does not hash-equal an empty tree (it hashes
      to `null`, which is `!==` any digest).
- [ ] Collision pairs hash **differently**: `{a, b}` (two sibling files) vs a
      single file `a` whose content is `0\nf:b`-style bytes that would collide under
      naive `type:path` concatenation; an empty directory `x/` plus an empty file
      `y` vs a single directory whose name contains a newline — every such
      naive-collision pair is distinct under length-framing.
- [ ] Node types are distinguished: a regular file vs a symlink with byte-identical
      target/content hash differently (POSIX; `t.skip` where symlink/FIFO creation
      is unavailable); a regular file vs a same-name FIFO/special hash differently.
- [ ] Raw-byte names are distinguished: an entry named with byte `0x80` vs one
      named `0x81` hash differently (no UTF-8 folding).

Forward path (in `tests/unit/shared-skill-links.test.js`):

- [ ] Absent target (symlink refused with `EPERM`/`EACCES`) → copies the source and
      records `{kind:'copied-skill', path, hash}` with `hash === hashDir(linkPath)`.
- [ ] Existing dir whose fingerprint equals the recorded hash AND source unchanged →
      no filesystem write, reported `unchanged`, hash re-recorded.
- [ ] Existing dir whose fingerprint equals the recorded hash but the source CHANGED
      → `rmSync`+`cpSync` refresh, reported `changed`, the new source fingerprint
      re-recorded.
- [ ] Existing dir whose fingerprint does NOT equal the recorded hash (user edited
      our copy) → left byte-for-byte intact, reported via `out.notices`, NO
      `rmSync`/`cpSync`, recorded hash NOT changed.
- [ ] Existing dir with NO recorded copied-skill entry, or a legacy hash-less entry
      (a user's own `wienerdog-foo/`) → left intact, reported via `out.notices`, NOT
      adopted, NEVER `rmSync`.
- [ ] The `applySkillLinks` symlink branch and regular-file branch behave exactly as
      before (this WP changes only the directory branch and the absent-path record).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "hashDir|skill-links|adapter|manifest"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Hook command shell-quoting — **WP-090** (shares `shared.js`; sequence after this).
- Managed-block marker robustness — **WP-091** (shares `manifest.js`/`shared.js`).
- Replacing/backing-up an existing user **symlink** in the namespace (adapters #4)
  — accepted residual; a symlink is cheap/idempotent to re-point. Not addressed here.
- Skill-source symlink containment (adapters #15) — separate.
- The `copied-skill` reverse-side (uninstall) containment and the fingerprint-guarded
  delete on the reverse path — that is **WP-088**, which constrains removal to the
  harness skills root + `wienerdog-*` namespace AND deletes only when the on-disk copy
  still fingerprints (via the SAME exported `hashDir`) to the `hash` this WP records.
  WP-088 depends on this WP for `hashDir` and the `hash` field.

## Design disposition — simplification evaluated and REJECTED (2026-07-12)

A "compare-to-live-source" simplification of this WP (and WP-088) was evaluated and
**rejected by the owner.** It proposed deleting `hashDir` entirely and deciding
ownership with a direct `dirsEqual(source, on-disk)` byte comparison, accepting a
"no auto-refresh on drift" tradeoff. Codex review found the simplification **less
safe, not simpler-and-equal**:

- `dirsEqual` encodes every non-directory entry as `f:<path>` and reads it through
  `readFileSync`, so it **shares the exact file↔symlink (and file↔special)
  node-type collision** the fingerprint's per-node `d/f/l/s` tags were built to
  close — a user could swap a packaged file for a symlink to identical bytes and
  the trees would compare equal.
- `dirsEqual` **fails open on unreadable trees**: a `readdirSync` error is silently
  treated as an empty subtree, so an unreadable directory can compare equal to an
  empty one; `hashDir` fails **closed** (returns `null`).
- On the reverse side the simplification introduced a **manifest-ordering
  false-delete**: comparing against the live source is unsound once `recordOnce`
  leaves a historical `copied-skill` entry positioned before newer staged-skill
  entries, so a pruned source could make an edited user copy compare equal and be
  deleted.
- It **relaxed the "uninstall leaves only the vault" guarantee** — it explicitly
  preserved Wienerdog's own copy whenever the packaged source had changed, i.e. it
  no longer reliably removes every Wienerdog-created copy.

The recorded-fingerprint design proves ownership against a value we recorded for
**this** object (independent of the live source and of manifest ordering), is
node-type-aware, and fails closed — so the fingerprint's complexity is justified on
the record. This design was verified Codex-clean at review round 10 ("ALL 15 specs
converged to Ready-clean").

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/089-adapter-skill-dir-ownership`; conventional commits; PR titled
   `fix(adapters): fingerprint-guard skill-dir refresh instead of blind rmSync (WP-089)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
</invoke>
