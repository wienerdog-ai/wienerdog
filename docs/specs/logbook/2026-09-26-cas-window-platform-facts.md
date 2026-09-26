---
date: 2026-09-26
title: Platform facts for the vault-write CAS window — link/O_EXCL create-or-fail, rename replace semantics, editor save strategies
related_wps: [WP-vault-write-cas-window]
---

# Platform facts for the vault-write CAS window

## Question

Feeding the design round of `docs/specs/WP-vault-write-cas-window.md` (Draft stub,
read in full). What does portable Node >= 18 actually give us for (1) atomic
create-or-fail, (2) an inode-conditional rename, (3) H4 under a link-based
publish, (4) which save strategy the user's editors and sync agents use, and
(5) what this machine measures. No design is proposed here.

Confidence tags: **verified-current** = fetched or measured today (2026-09-26);
**recalled** = from memory, not re-checked; **UNVERIFIED** = could not be
established, do not build on it.

Sources pinned today:
- Node docs: `doc/api/fs.md` at tag `v25.9.0`,
  https://github.com/nodejs/node/blob/v25.9.0/doc/api/fs.md (rendered:
  https://nodejs.org/api/fs.html). Node 25.9.0 bundles **libuv 1.52.1**
  (`process.versions.uv`, measured).
- libuv source at tag `v1.52.1` and, for the Node 18 floor, tag `v1.43.0`
  (the libuv Node 18.0.0 shipped with — recalled; the two tags were fetched and
  the relevant functions are byte-identical in shape, see below):
  https://github.com/libuv/libuv/blob/v1.52.1/src/win/fs.c,
  https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fs.c,
  https://github.com/libuv/libuv/blob/v1.52.1/src/win/error.c
- Linux man-pages (man7.org, fetched today): rename(2), link(2), open(2).
- macOS man pages on this machine (Darwin 25.5.0): `man 2 rename`, `man 2 link`.
- Microsoft Learn (fetched today): CreateHardLinkW, MoveFileExW,
  FILE_RENAME_INFO, "Alternatives to using Transactional NTFS".
- Linux kernel docs, ext4 admin guide (fetched today).

## Findings

### 0. What the primitive does today (read from the tree, `src/core/dream/vault-write.js`)

- Stages via `fs.openSync(candidate, O_WRONLY|O_CREAT|O_EXCL[|O_NOFOLLOW], 0o666)`
  on a random `.wienerdog-vault-write.<16hex>.tmp` in the target's parent,
  `writeSync` loop, `closeSync`. **No `fsync`/`fdatasync` of the temp, and no
  fsync of the parent directory, anywhere in the file** (`grep -n 'fsync\|fdatasync'`
  → no hits). verified-current.
- Then `lstatOrNull(target)` → symlink / non-regular refusal → conditional arm
  (`readFileSync` + `Buffer.compare` against `expect`) or create arm
  (`targetNow` present → refuse) → `fs.renameSync(tmp, targetLexical)`.
  The compare reads the target **by path**, through a descriptor opened and
  closed inside `readFileSync`; nothing is held across the rename. verified-current.

### 1. Atomic create-or-fail primitives in portable Node

**What Node calls (verified-current, libuv source):**

| Node call | unix (libuv `src/unix/fs.c`) | win32 (libuv `src/win/fs.c`) |
|---|---|---|
| `fs.linkSync(a, b)` | `link(req->path, req->new_path)` (`uv__fs_work`, `X(LINK, …)`, line 1714 at v1.52.1) — plain `link(2)`, not `linkat` | `fs__link`: `CreateHardLinkW(new_pathw, pathw, NULL)` (line 2765–2771 at v1.52.1; same body at v1.43.0 line 2370) |
| `fs.openSync(p, 'wx')` | `open(2)` with `O_CREAT\|O_EXCL` | `fs__open` maps `UV_FS_O_CREAT\|UV_FS_O_EXCL` (with or without TRUNC) → `CreateFileW(... CREATE_NEW ...)` (lines 515–525), share mode `FILE_SHARE_READ\|WRITE\|DELETE` unless `UV_FS_O_EXLOCK` (lines 509–513) |

Node's docs say only "Creates a new link from the `existingPath` to the
`newPath`. See the POSIX link(2) documentation" for `fs.link`/`fs.linkSync`,
and for flags: "`'wx'`: Like `'w'` but fails if the path exists", "`O_EXCL|O_CREAT`
to `CREATE_NEW`, as accepted by `CreateFileW`", "On POSIX, if the path is a
symbolic link, using `O_EXCL` returns an error even if the link is to a path
that does not exist. **The exclusive flag might not work with network file
systems.**" (fs.md v25.9.0, lines ~8936–8951). verified-current. There is **no
`linkat` binding** and no `AT_SYMLINK_FOLLOW` control in `fs` (measured: `Object.keys(fs)`
matching /rename|link|exch|swap/ = `link, linkSync, readlink, readlinkSync, rename,
renameSync, symlink, symlinkSync, unlink, unlinkSync`). verified-current.

**Error codes on "destination exists":**
- POSIX `link(2)`: `EEXIST` "newpath already exists" (man7 link(2); macOS
  `man 2 link`: "[EEXIST] The link named by path2 already exists"). verified-current.
- POSIX `open(2)` `O_CREAT|O_EXCL`: `EEXIST`; symlinks at the name are not
  followed and fail (man7 open(2)). verified-current.
- win32: libuv maps **both `ERROR_ALREADY_EXISTS` (183) and `ERROR_FILE_EXISTS` (80)
  → `UV_EEXIST`** (`src/win/error.c` lines 96–97). Which of the two
  `CreateHardLinkW` returns on an existing name is recalled as
  `ERROR_ALREADY_EXISTS`, and `CreateFileW(CREATE_NEW)` is documented to fail
  with `ERROR_FILE_EXISTS` (recalled; CreateFileW page not re-fetched) — either
  way Node surfaces `EEXIST`. The mapping is verified-current; the Win32 code
  each call emits is recalled.
- Note a libuv quirk (verified-current, `src/win/fs.c` lines ~620–626):
  `ERROR_FILE_EXISTS` with `O_CREAT` **without** `O_EXCL` is reported as
  `EISDIR`; **with** `O_EXCL` it is reported as the plain Win32 mapping (`EEXIST`).

**Same volume:** required everywhere. Linux: `EXDEV` "oldpath and newpath are
not on the same mounted filesystem"; macOS: `[EXDEV]`; Windows: "all hard links
to a file must be on the same volume" (CreateHardLinkW remarks) and
`ERROR_NOT_SAME_DEVICE` → `UV_EXDEV` (error.c line 167). verified-current. The
primitive already stages the temp in the target's own parent directory, so a
link from it is same-volume except where the parent itself is a mount point
crossing (not examined).

**Hard-link support per filesystem:**

| Platform / FS | `link` supported? | Create-or-fail atomic? | Source / confidence |
|---|---|---|---|
| darwin APFS | yes | yes (EEXIST, one syscall) | measured today (§5) |
| darwin HFS+ | yes | yes | measured today on an HFS+ disk image (§5) |
| darwin FAT32 (msdos) | **no — `ENOTSUP`** on a fresh name; **`EEXIST` on an existing name** | n/a | measured today on a FAT32 image (§5) |
| darwin exFAT | **no — `ENOTSUP`** fresh; `EEXIST` existing | n/a | measured today on an exFAT image (§5) |
| linux ext4 / btrfs / xfs | yes | yes (local FS, single `link(2)`) | link(2) semantics verified-current; per-FS support recalled (standard POSIX local FSes) |
| linux vfat/exFAT | no — link(2) documents `EPERM` "The filesystem containing oldpath and newpath does not support the creation of hard links" | n/a | man7 link(2) verified-current; that vfat returns EPERM specifically is recalled |
| linux NFS | link exists, but "the return code may be wrong in case the NFS server performs the link creation and dies before it can say so. Use stat(2) to find out if the link got created" | **not reliably** — success may be reported as failure | man7 link(2) verified-current |
| linux NFS, `O_EXCL` | "supported only when using NFSv3 or later on kernel 2.6 or later"; otherwise racy | conditional | man7 open(2) verified-current |
| linux FUSE (sshfs, rclone, gocryptfs, …) | per-implementation; no general guarantee | UNVERIFIED | — |
| linux CIFS/SMB mount | UNVERIFIED (depends on server + unix extensions) | UNVERIFIED | — |
| win32 NTFS | yes, via `CreateHardLinkW` (libuv verified) | recalled as atomic at the FS; MS doc does not state atomicity | CreateHardLinkW: "only supported on the NTFS file system, and only for files" verified-current |
| win32 ReFS | MS support table (Win8/2012 era): ReFS **No**. Third-party sources: ReFS v3.5 (Windows Server 2022) added hard links **on freshly formatted volumes only** | UNVERIFIED on current Windows 11 | CreateHardLinkW page verified-current; ReFS 3.5 claim from https://gist.github.com/XenoPanther/15d8fad49fbd51c6bd946f2974084ef8 (search result, not a primary source) |
| win32 FAT32 / exFAT | no (CreateHardLinkW is NTFS-only per doc). **Which Win32 error, hence which Node code, is UNVERIFIED** — if it is `ERROR_INVALID_FUNCTION`, libuv maps it to **`EISDIR`** (error.c line 168); if `ERROR_NOT_SUPPORTED`, to `ENOTSUP` (line 156) | n/a | doc verified-current; error code UNVERIFIED |
| win32 SMB share | SMB 3.0: Yes; SMB 3.0 with continuous availability / Transparent Failover / Scale-out: **No** ("SMB 3.0 does not support creation of hard links on shares with continuous availability capability") | UNVERIFIED | CreateHardLinkW support table, verified-current |
| win32 `CREATE_NEW` (`'wx'`) | available on all Windows FSes (it is a CreateFileW disposition) | recalled atomic on local NTFS; network UNVERIFIED | libuv mapping verified-current |

**Design-relevant consequence (fact, not design):** `fs.linkSync` is **not
available on every filesystem a vault can live on** — measured `ENOTSUP` on FAT32
and exFAT here, NTFS-only by Microsoft's own doc on Windows. `openSync(...,'wx')`
is available everywhere but creates an **empty** file and then needs writes, so
by itself it is not an H4-preserving publish (see §3). Also: on FAT/exFAT,
`link` onto an **existing** name returns `EEXIST`, not `ENOTSUP` (measured) — the
existence check precedes the capability check, so an `EEXIST` does not prove the
FS supports links.

### 2. Is there an inode-conditional rename, and does Node reach any flagged rename?

**No platform offers "rename only if the destination is still inode X".** What
exists is "fail if destination exists" and "atomic swap":

| Platform | Call | Flags | Source |
|---|---|---|---|
| Linux | `renameat2` | `RENAME_NOREPLACE` ("Return an error if newpath already exists"), `RENAME_EXCHANGE` ("Atomically exchange oldpath and newpath. Both pathnames must exist"). NOREPLACE support: ext4 3.15, btrfs/tmpfs/cifs 3.17, xfs 4.0, others (incl. ext2, vfat) 4.9 | man7 rename(2), verified-current |
| macOS | `renamex_np` / `renameatx_np` | `RENAME_EXCL` ("cause EEXIST to be returned if the destination already exists"), `RENAME_SWAP` ("cause the source and target to be atomically swapped"), each "On file systems that support it (see getattrlist(2) VOL_CAP_INT_RENAME_EXCL / _SWAP)" | `man 2 rename` on this machine, verified-current |
| Windows | `SetFileInformationByHandle(FileRenameInfo)` with `ReplaceIfExists=FALSE` ("If this field is FALSE and the target file exists then operation will return an error"); `FileRenameInfoEx` with flags; `ReplaceFile` for document-style replacement | (in the Call cell) | FILE_RENAME_INFO page verified-current; MS "Alternatives to TxF" recommends "write the document to a new file, then replace the original file with the new one … with the ReplaceFile API" verified-current |

None of these is conditional on the destination's identity. `RENAME_EXCHANGE`/
`RENAME_SWAP` are the nearest thing: the displaced object survives under the
source name instead of being unlinked (per their definitions — inference, not
measured).

**Node exposes none of them.** `fs.rename`/`fs.renameSync` take `(oldPath, newPath)`
only; docs: "In the case that `newPath` already exists, it will be overwritten.
If there is a directory at `newPath`, an error will be raised instead." Measured:
`fs.constants` has no RENAME_*/NOREPLACE/SWAP key (only `O_EXCL`,
`COPYFILE_EXCL`, `UV_FS_COPYFILE_EXCL`). verified-current.

**What `fs.renameSync` calls:**
- unix (linux + darwin): plain `rename(req->path, req->new_path)`
  (`src/unix/fs.c` line 1726 at v1.52.1; line 1728 at v1.43.0). verified-current.
  Linux: "If newpath already exists, it will be atomically replaced, so that
  there is no point at which another process attempting to access newpath will
  find it missing" (man7). macOS: "If new exists, it is first removed … The
  rename() system call guarantees that an instance of new will always exist,
  even if the system should crash in the middle of the operation" (`man 2 rename`).
  NFS: "you can not assume that if the operation failed, the file was not
  renamed" (man7). verified-current.
- win32: `MoveFileExW(pathw, new_pathw, MOVEFILE_REPLACE_EXISTING)` and nothing
  else (`src/win/fs.c` `fs__rename`, line 2333 at v1.52.1; line 1953 at v1.43.0).
  verified-current. **Correction to the stub's framing:** the MoveFileExW page
  fetched today **does not document atomicity either way** — it says only "If a
  file named lpNewFileName exists, the function replaces its contents with the
  contents of the lpExistingFileName file". "Documented as not atomic" is not
  supported by that page; the defensible statement is "**not documented as
  atomic**". Whether a same-volume NTFS replace-rename is atomic in practice is
  recalled-yes, UNVERIFIED here.
- win32 extra failure mode (recalled, UNVERIFIED): `MoveFileExW` replace fails
  with `ERROR_ACCESS_DENIED` (→ libuv `EPERM`, error.c line 158) or
  `ERROR_SHARING_VIOLATION` (→ `EBUSY`, line 86) when the destination is open by
  another process without `FILE_SHARE_DELETE`, or (pre-POSIX-semantics Windows)
  open at all. libuv's own opens pass `FILE_SHARE_DELETE` (verified), but an
  editor, indexer or AV scanner may not. **This bears directly on candidate 1 on
  win32: holding a descriptor on the target across the rename may itself make
  the rename fail.** Needs a Windows measurement.

`fs.copyFileSync(src, dst, COPYFILE_EXCL)` is also create-or-fail (unix libuv
opens dst with `O_WRONLY|O_CREAT|O_EXCL`, `src/unix/fs.c` ~line 1257), but it
**writes the bytes into the new name after creating it**, so a prefix is
observable — not an H4-preserving publish. verified-current (source read).

### 3. H4 under a link-based publish

- `link(tmp, target)` makes `target` a second name for the **same inode** that
  was fully written and closed before the call — confirmed by measurement (§5d:
  same `ino`, `nlink` 2, content = full payload). A reader opening `target`
  therefore sees the whole content or ENOENT, never a prefix. **H4 holds on the
  create arm** under link-publish — with the caveat that before the link the
  target is *absent*, which is exactly the create arm's premise. verified-current
  (measured on APFS, HFS+).
- Follow-ups the design must own (facts):
  1. After a successful link there are **two names for one inode** until
     `unlink(tmp)`; measured `nlink` 2 → 1 after unlink. A crash between the two
     leaves the `.wienerdog-vault-write.*.tmp` name **in the vault** holding the
     published bytes (same class as H7's staging-object residual). A writer that
     edits *in place* through either name edits both.
  2. An `unlink(tmp)` failure after a successful link is a **new outcome**: the
     write is published but a staging name survives — H7's taxonomy has no row
     for "published AND a leftover" today (inference from the H7 row text).
  3. On NFS the link's return code can be wrong (man7 link(2)); the documented
     remedy is to `stat` the unique source and check `nlink == 2`.
  4. On FAT32/exFAT (darwin measured) and non-NTFS Windows volumes, link is not
     available, so a link-publish needs a fallback — and the fallback's
     semantics are the design's.
- **fsync:** the primitive fsyncs nothing today (§0). On rename-publish, ext4's
  default `auto_da_alloc` papers over this: it "will detect the
  replace-via-rename and replace-via-truncate patterns and force that any
  delayed allocation blocks are allocated such that at the next journal commit
  … the data blocks of the new file are forced to disk before the rename() operation
  is committed" (docs.kernel.org/admin-guide/ext4.html, verified-current).
  **That heuristic names rename and truncate only; a link-publish is not covered**
  (inference from the quoted text). Note also that the create arm is *not* a
  replace, so auto_da_alloc arguably does not cover today's create-arm rename
  either (inference). Crash durability is outside H4's stated wording ("a reader
  looking at the target at any instant"), but a zero-length file after a power
  loss is observable at the target; the design should decide whether H4 speaks
  to crashes.

### 4. How the user's editors and sync agents save

Legend: **in-place** = open existing name with truncate + write (same inode;
a reader can see a prefix; a held descriptor sees the new bytes). **temp+rename**
= write a new object, rename it over the name (new inode; our rename can
silently unlink it). **backup-rename+new** = rename the original away, create a
fresh file at the name, write it (new inode; the name is briefly absent, then
briefly a prefix).

| Writer | Mechanism | Source | Confidence |
|---|---|---|---|
| **Obsidian desktop** (the product's primary editor) | **in-place.** The bundled vault adapter's `write`, `writeBinary` and `process` all call `this.fsPromises.writeFile(fullPath, data)` and then `applyWriteOptions` (mtime); `process` is `readFile` → callback → `writeFile`, serialised by the adapter's own `this.queue(...)`. No temp, no rename on the write path; `fsPromises.rename` appears only on the adapter's rename/trash paths. | Read-only grep of `/Applications/Obsidian.app/Contents/Resources/obsidian.asar` (installer 1.12.4, dated 2026-02-27) on this machine. Public API doc: https://docs.obsidian.md/Reference/TypeScript+API/DataAdapter/write ("If the file exists its content will be overwritten"); `DataAdapter.process` is documented as "Atomically read, modify, and save" — the bundle shows that atomicity is the in-process queue, **not** an on-disk atomic replace | verified-current for the installer asar. **Caveat:** Obsidian auto-updates its app asar into `~/Library/Application Support/obsidian/` (recalled); that copy was **not** inspected (user home is off-limits for this task). That the editor's keystroke save goes through `adapter.write` is inference (Vault.modify → adapter.write), not traced |
| **Obsidian Sync** | UNVERIFIED; inference: it writes via the same adapter, so in-place | https://obsidian.md/help/sync/troubleshoot (silent on mechanism) | UNVERIFIED |
| **VS Code** | **in-place by default.** `DiskFileSystemProvider.writeFile` takes the temp+rename path only when the caller passes `opts.atomic.postfix` (`src/vs/platform/files/node/diskFileSystemProvider.ts` line 250 at main `90da9001`, 2026-09-26); the text-file save path (`textFileService.ts` line 273 `this.fileService.writeFile(resource, readable, options)`, `textFileEditorModel.ts`) contains no `atomic` option. Maintainer bpasero, https://github.com/microsoft/vscode/issues/98063: "All our writes in VSCode today operate on the target file: truncate the file to 0 bytes, write the contents into the file". | source fetched today | verified-current for the code paths grepped; "no ordinary-save caller opts in" is verified only for those two files. `files.saveConflictResolution` (default `askUser`, alt `overwriteFileOnDisk`) is an mtime/etag check before write — recalled, not re-fetched |
| **vim / neovim** | `'backupcopy'` default **`auto`** (neovim; Vim's Unix Vi-default is `yes` — recalled). `auto`: "When Vim sees that renaming the file is possible without side effects (the attributes can be passed on and the file is not a link) that is used" — i.e. for an ordinary vault note, **backup-rename+new** (`no`: "rename the file and write a new one"), **not** temp+rename. `yes` = copy to backup then overwrite original in place. | https://github.com/neovim/neovim/blob/master/runtime/doc/options.txt, fetched today | verified-current |
| **macOS TextEdit / NSDocument** | **temp+rename-style safe save** (new file written, swapped in via `replaceItemAtURL`); hard links to the original break | Apple: https://developer.apple.com/documentation/foundation/nsfilemanager/1412432-replaceitematurl ("replaces the contents … in a manner that ensures no data loss occurs"); TextEdit behaviour: https://eclecticlight.co/2019/09/12/card-tricks-with-textedit-and-saving-files-safely-to-ssd/ (third-party) | API doc verified-current (by delegated survey); TextEdit specifics third-party |
| **Syncthing** | **temp+rename.** "Syncthing never writes directly to a destination file. Instead all changes are made to a temporary copy which is then moved in place over the old version." Temp names `.syncthing.<name>.tmp` / `~syncthing~<name>.tmp` | https://docs.syncthing.net/users/syncing.html | verified-current (delegated survey) |
| **iCloud Drive** | UNVERIFIED (Apple does not document fileproviderd's write path) | — | UNVERIFIED |
| **Dropbox** | UNVERIFIED (recalled: temp then move) | — | UNVERIFIED |
| **OneDrive (Microsoft client)** | UNVERIFIED | — | UNVERIFIED |
| **Google Drive for desktop** | UNVERIFIED (community reports of a `.tmp.drivedownload` staging folder suggest temp-then-move) | — | UNVERIFIED |

Reading: the product's **primary** editor (Obsidian desktop, installer build)
and VS Code write **in place**; vim's default and TextEdit replace the inode;
Syncthing replaces by rename; the closed sync agents are unknown. So neither
"all writers are in-place" nor "all writers rename" holds for a real vault.

### 5. Measured on this machine (darwin 25.5.0, Node v25.9.0, libuv 1.52.1)

Script: `scratchpad/measure.js` (APFS, `/private/tmp` on `disk3s5`, APFS
personality confirmed by `diskutil`). Exact output:

```
node v25.9.0 darwin dir /private/tmp/claude-501/.../scratchpad/m/cas-aYWA3N
fs type: apfs
(b) linkSync onto existing dest -> EEXIST -17 | dest still: OLD-DEST
(b2) linkSync onto dangling symlink -> EEXIST
(c) openSync(dest,'wx') on existing -> EEXIST -17
(c2) openSync(dangling,'wx') -> EEXIST
(d) link fresh: tmp.ino 464694132 fresh.ino 464694132 same: true nlink 2 content NEW-TMP
(d) after unlink tmp: fresh nlink 1
(e) dest ino before 464694131 after rename 464694136 changed: true
(e) held fd: fstat.ino 464694131 nlink 0 reads: "OLD-DEST" | path reads: "REPLACEMENT"
(f) in-place writeFileSync: ino 464694136 held fd reads "INPLACE-EDIT"
(g) fs keys matching /rename|link|exch|swap/i: link,linkSync,readlink,readlinkSync,rename,renameSync,symlink,symlinkSync,unlink,unlinkSync
(g) fs.constants keys matching /RENAME|EXCL|SWAP|NOREPLACE/: O_EXCL,UV_FS_COPYFILE_EXCL,COPYFILE_EXCL
```

Additional run, `scratchpad/fsprobe.js` on 20–40 MB disk images created with
`hdiutil` and mounted **inside the scratchpad** (`-nobrowse -mountpoint`),
detached afterwards (verified: no scratchpad mounts remain):

```
hfs      link->existing: EEXIST | link->fresh: OK sameIno=true nlink=2 | wx existing: EEXIST | rename over held fd: pathIno 18->22 heldReads=OLD
exfat    link->existing: EEXIST | link->fresh: ENOTSUP | wx existing: EEXIST | rename over held fd: pathIno 7->11 heldReads=OLD
fat32    link->existing: EEXIST | link->fresh: ENOTSUP | wx existing: EEXIST | rename over held fd: pathIno 11->29 heldReads=OLD
```

Readings (all verified-current, this machine only):
- (b)(c) both create-or-fail calls return `EEXIST` (errno -17) and leave the
  destination untouched; both also refuse a **dangling symlink** at the name.
- (d) link-publish: one inode, two names, full content; unlink of tmp → nlink 1.
- (e) a rename over the target gives the path a **new inode**; a descriptor held
  on the old target keeps reading the **old** bytes and its `fstat().nlink` is
  **0** — so a held descriptor can *detect after the fact* that its object was
  unlinked/replaced.
- (f) contrast: an in-place write (`writeFileSync` = open O_TRUNC + write)
  keeps the inode, and the held descriptor sees the new bytes.
- The fresh-file path on FAT32/exFAT fails `ENOTSUP`: link-publish is not
  universally available even on darwin.

## Implications for Wienerdog

(Facts the architect needs; no design chosen.)

1. **Create arm (`expect` absent):** `fs.linkSync(tmp, target)` closes the
   check-then-act window in one syscall **where hard links exist** (APFS, HFS+,
   ext4/btrfs/xfs, NTFS) and keeps H4 (same fully-written inode). It is
   **unavailable** on FAT32/exFAT (measured `ENOTSUP` on darwin; NTFS-only per
   Microsoft on win32) and **unreliable** on NFS (wrong return codes possible).
   A vault on a USB stick / SD card formatted exFAT is a realistic user setup,
   so a fallback path and its outcome row are mandatory, not optional. `'wx'`
   is universal but is not a publish (creates empty, then writes → H4 broken).
2. **Overwrite arm (`expect` present):** no portable Node call closes it.
   No OS offers an inode-conditional rename; the flagged renames that come
   closest (`RENAME_EXCHANGE`/`RENAME_SWAP`, `FileRenameInfo` with
   `ReplaceIfExists=FALSE`) are **not reachable from Node** (no binding, no
   constant) and would need a native addon, which ADR-0004's zero-runtime-deps
   rule (CLAUDE.md) effectively excludes.
3. **Candidate 1 (held descriptor)** re-shapes but does not close: against an
   **in-place** writer, the held fd sees the new bytes after the rename (§5f),
   and the displaced object's content is **still readable through the held fd**
   after the rename (§5e: old bytes readable, nlink 0) — i.e. the user's edit is
   detectable *and recoverable* post hoc from the descriptor, not prevented.
   Against a **rename-saving** writer, the editor's new object is silently
   unlinked by our rename and the held fd sees nothing of it (it holds the
   pre-editor object). On win32, holding the fd may make `MoveFileExW` fail
   (UNVERIFIED; needs Windows measurement) — a new refusal cause.
   **Mapped to the writers in §4:** the in-place writers are Obsidian desktop
   (installer 1.12.4 bundle) and VS Code — so candidate 1 reaches the product's
   primary editor. It does not reach vim's default, TextEdit, or Syncthing
   (inode-replacing), nor the unknown sync agents.
   Two side facts: (i) an in-place writer truncates then writes, so the
   primitive's compare read can itself observe a **prefix** of the user's
   save — which today yields a (correct) refusal, not a loss; (ii) vim's
   backup-rename+new leaves the name **absent** for an instant, which is the
   create arm's premise — a create-arm link can win that instant and vim's
   subsequent create then writes over our object (vim opens the name for
   writing; whether with O_EXCL is UNVERIFIED).
4. **The primitive fsyncs nothing.** Any link-based publish loses ext4's
   `auto_da_alloc` rename heuristic; if H4 is meant to cover crash visibility,
   the spec must say so and add fsync explicitly.
5. **The stub's statement that MoveFileExW replace is "documented as not
   atomic" is not supported by the MoveFileExW page** (silent on atomicity).
   The disclosure sites should say "not documented as atomic" if they cite it.
6. Any new outcome — `ENOTSUP`/`EPERM`/`EISDIR`(win FAT, UNVERIFIED) from link,
   `EEXIST` from link on the create arm, "published but staging name survives"
   after a failed unlink, win32 `EPERM`/`EBUSY` on rename with a held fd — needs
   a row in H7's taxonomy (stub open question 2).

## Open questions

- Win32 measurements not possible here: (a) the Node error code for
  `fs.linkSync` on FAT32/exFAT/ReFS volumes (EISDIR vs ENOTSUP vs EPERM);
  (b) whether `fs.renameSync` over a target that this process holds open
  (libuv opens with `FILE_SHARE_DELETE`) succeeds on Windows 10/11 NTFS;
  (c) whether `CreateHardLinkW` works on current Windows 11 ReFS / Dev Drive.
- Linux measurements not possible here: link/`O_EXCL` behaviour on common FUSE
  vault locations (rclone mount, gocryptfs, Cryptomator) and on CIFS mounts.
- Whether iCloud Drive / OneDrive "Files On-Demand" placeholder files (dataless
  files; macOS link(2) lists `[EDEADLK] … a "dataless" file`) interfere with a
  link on a vault kept in a cloud-synced folder — UNVERIFIED.
