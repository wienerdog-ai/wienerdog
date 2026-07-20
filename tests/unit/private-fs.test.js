'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mkdirPrivate,
  writeFilePrivate,
  createLogStreamPrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
  A9_PRIVATE_DIRS,
  A9_PRIVATE_STATE_FILES,
  A9_PRIVATE_CORE_FILES,
} = require('../../src/core/private-fs');
const { WienerdogError } = require('../../src/core/errors');

const POSIX = process.platform !== 'win32';

/** @param {string} p @returns {number} */
function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

/** Minimal paths object over a temp root, shaped like getPaths()'s A5+A9 fields. */
function pathsFor(root) {
  return {
    core: path.join(root, 'wd'),
    config: path.join(root, 'wd', 'config.yaml'),
    manifest: path.join(root, 'wd', 'install-manifest.json'),
    state: path.join(root, 'wd', 'state'),
    logs: path.join(root, 'wd', 'logs'),
    secrets: path.join(root, 'wd', 'secrets'),
  };
}

/** Run `fn` under a permissive umask, restoring the previous one. */
function withUmask(mask, fn) {
  const prev = process.umask(mask);
  try {
    return fn();
  } finally {
    process.umask(prev);
  }
}

test('private-fs: mkdirPrivate produces 0700 under a permissive umask (worked example)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    mkdirPrivate(path.join(root, 'state'));
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
    mkdirPrivate(path.join(root, 'state')); // idempotent
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
  });
});

test('private-fs: writeFilePrivate writes 0600 atomically, parent 0700 (worked example)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const dest = path.join(root, 'state', 'x');
    writeFilePrivate(dest, 'hi');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'hi');
    assert.equal(modeOf(dest), 0o600);
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
    writeFilePrivate(dest, 'second'); // overwrite keeps the mode
    assert.equal(fs.readFileSync(dest, 'utf8'), 'second');
    assert.equal(modeOf(dest), 0o600);
    assert.deepEqual(fs.readdirSync(path.join(root, 'state')), ['x'], 'no leftover temp file');
  });
});

test('private-fs: repairPrivateModes fixes a legacy 0755/0644 install and is idempotent', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.state, 'dream-scratch'), { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.state, 'quarantine'), { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(paths.state, 'digest.md'), 'd', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'alerts.jsonl'), '{}\n', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.logs, 'dream', 'run.log'), 'log', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'dream-scratch', 'a.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'quarantine', '2026-07-17-leak.md'), 's', { mode: 0o644 });

    const first = repairPrivateModes(paths);
    assert.ok(first.changed >= 9, `expected >= 9 changes, got ${first.changed}`);
    assert.equal(modeOf(paths.core), 0o700);
    assert.equal(modeOf(paths.state), 0o700);
    assert.equal(modeOf(paths.logs), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'dream-scratch')), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'quarantine')), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'digest.md')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'alerts.jsonl')), 0o600);
    assert.equal(modeOf(path.join(paths.logs, 'dream', 'run.log')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'dream-scratch', 'a.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'quarantine', '2026-07-17-leak.md')), 0o600);

    assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'second call is a no-op');
  });
});

test('private-fs: repairPrivateModes fixes a legacy A9 install — secrets/, tokens, grants/pins, metadata, log dirs (WP-a9)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.chmodSync(paths.secrets, 0o755);
    fs.writeFileSync(path.join(paths.secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-client.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'broker-grants.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'exec-pins.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'run-evidence.jsonl'), '{}\n', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'schedule.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'watermarks.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(paths.config, 'vault: null\n', { mode: 0o644 });
    fs.writeFileSync(paths.manifest, '{}\n', { mode: 0o644 });
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.chmodSync(paths.logs, 0o700);
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o777);

    const before = insecureEntries(paths);
    assert.ok(before.includes(paths.secrets), 'a loosened secrets/ is flagged');
    assert.ok(before.includes(path.join(paths.secrets, 'google-token-read.json')), 'a loosened token is flagged');
    assert.ok(before.includes(paths.config), 'a loosened config.yaml is flagged (metadata, repair-only)');
    assert.ok(before.includes(path.join(paths.logs, 'dream')), 'a loosened logs/<job> dir is flagged');
    assert.equal(before.length, 11, 'secrets dir + log dir + 9 files');

    const first = repairPrivateModes(paths);
    assert.equal(first.changed, 11, 'every wrong-moded entry repaired');
    assert.equal(modeOf(paths.secrets), 0o700);
    assert.equal(modeOf(path.join(paths.secrets, 'google-token-read.json')), 0o600);
    assert.equal(modeOf(path.join(paths.secrets, 'google-client.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'broker-grants.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'exec-pins.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'run-evidence.jsonl')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'schedule.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'watermarks.json')), 0o600);
    assert.equal(modeOf(paths.config), 0o600);
    assert.equal(modeOf(paths.manifest), 0o600);
    assert.equal(modeOf(path.join(paths.logs, 'dream')), 0o700);

    assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'second call is a no-op');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
  });
});

test('private-fs: an over-tight 0600 or 000 secrets/ is flagged (broken store) and repaired to 0700 (WP-a9)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    for (const tight of [0o600, 0o000]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
      const paths = pathsFor(root);
      fs.mkdirSync(paths.secrets, { recursive: true });
      fs.chmodSync(paths.core, 0o700);
      fs.chmodSync(paths.secrets, tight);

      const flagged = insecureEntries(paths);
      assert.ok(flagged.includes(paths.secrets), `a ${tight.toString(8)} secrets/ is flagged, not passed as clean`);
      repairPrivateModes(paths);
      assert.equal(modeOf(paths.secrets), 0o700, `a ${tight.toString(8)} secrets/ is repaired`);
    }
  });
});

test('private-fs: over-tight FILES are flagged in either direction too (expected-mode equality)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    fs.writeFileSync(path.join(paths.state, 'broker-grants.json'), '{}', { mode: 0o400 });

    assert.deepEqual(insecureEntries(paths), [path.join(paths.state, 'broker-grants.json')]);
    repairPrivateModes(paths);
    assert.equal(modeOf(path.join(paths.state, 'broker-grants.json')), 0o600);
  });
});

test('private-fs: TWO-PHASE repair — a 000 secrets/ hiding a 0644 token is fully fixed by a SINGLE call (round-3)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.writeFileSync(path.join(paths.secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-client.json'), '{}', { mode: 0o644 });
    fs.chmodSync(paths.secrets, 0o000); // the trapped-file case: readdir fails while 000

    const r = repairPrivateModes(paths);
    assert.equal(modeOf(paths.secrets), 0o700, 'phase 1 opened the dir');
    assert.equal(modeOf(path.join(paths.secrets, 'google-token-read.json')), 0o600, 'phase 2 reached the trapped token');
    assert.equal(modeOf(path.join(paths.secrets, 'google-client.json')), 0o600, 'phase 2 reached the trapped client JSON');
    assert.equal(r.changed, 3, 'dir + both trapped files counted');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'a follow-up scan is clean after ONE repair call');
  });
});

test('private-fs: FIXED-POINT repair — TWO nested unreadable dirs (logs/=000, logs/dream/=000) fully fixed by a SINGLE call (WP-a9 G1)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.writeFileSync(path.join(paths.logs, 'dream', 'run.log'), 'log', { mode: 0o644 });
    // Two nested levels of unreadable directory: one enumerate-then-repair pass
    // can only open ONE level, so a fixed count of passes leaves the innermost
    // file untouched. Chmod inner-first here so BOTH end 000.
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o000);
    fs.chmodSync(paths.logs, 0o000);

    repairPrivateModes(paths);
    assert.equal(modeOf(paths.logs), 0o700, 'outer logs/ opened');
    assert.equal(modeOf(path.join(paths.logs, 'dream')), 0o700, 'inner logs/dream/ opened');
    assert.equal(modeOf(path.join(paths.logs, 'dream', 'run.log')), 0o600, 'the doubly-trapped log reached in ONE call');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'clean after a single repair call');
  });
});

test('private-fs: FIXED-POINT repair — core/=000 hiding secrets/=000 hiding a 0644 token fixed by a SINGLE call (WP-a9 G1)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.writeFileSync(paths.config, 'vault: null\n', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-client.json'), '{}', { mode: 0o644 });
    // secrets/ is 000 AND its parent core/ is 000 — two nested unreadable levels
    // above the trapped token/client files. Chmod inner-first.
    fs.chmodSync(paths.secrets, 0o000);
    fs.chmodSync(paths.core, 0o000);

    repairPrivateModes(paths);
    assert.equal(modeOf(paths.core), 0o700, 'outer core/ opened');
    assert.equal(modeOf(paths.secrets), 0o700, 'inner secrets/ opened');
    assert.equal(modeOf(path.join(paths.secrets, 'google-token-read.json')), 0o600, 'trapped token reached in ONE call');
    assert.equal(modeOf(path.join(paths.secrets, 'google-client.json')), 0o600, 'trapped client JSON reached in ONE call');
    assert.equal(modeOf(paths.config), 0o600, 'the core-root metadata file reached too');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'clean after a single repair call');
  });
});

test('private-fs: G2 — a symlinked secrets/ is NOT followed/chmodded and IS flagged as an anomaly', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.core, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    // An external owned dir with a 0644 file — the target the symlink points at.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-external-'));
    fs.chmodSync(external, 0o755);
    const externalFile = path.join(external, 'shared.json');
    fs.writeFileSync(externalFile, '{}', { mode: 0o644 });
    // secrets/ IS a symlink to that external dir.
    fs.symlinkSync(external, paths.secrets);

    // Flagged as an anomaly by the read predicate (and doctor/digest count it).
    assert.ok(insecureEntries(paths).includes(paths.secrets), 'symlinked secrets/ is flagged');
    assert.equal(scanPrivateModes(paths).insecure >= 1, true);

    const r = repairPrivateModes(paths);
    // The external target and its file are UNTOUCHED — repair never followed the link.
    assert.equal(fs.lstatSync(paths.secrets).isSymbolicLink(), true, 'secrets/ is still the symlink (not replaced)');
    assert.equal(modeOf(external), 0o755, 'external target dir mode untouched');
    assert.equal(modeOf(externalFile), 0o644, 'external file mode untouched — not chmodded to 0600');
    // Still flagged after repair (repair cannot fix an anomaly — surfaced, not silent).
    assert.ok(insecureEntries(paths).includes(paths.secrets), 'still flagged after repair');
    assert.equal(typeof r.changed, 'number');
  });
});

test('private-fs: G2 — a symlinked logs/<job> is not followed/chmodded and is flagged', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.logs, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.logs, 0o700);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-external-'));
    fs.chmodSync(external, 0o755);
    const externalLog = path.join(external, 'foreign.log');
    fs.writeFileSync(externalLog, 'x', { mode: 0o644 });
    // logs/dream IS a symlink to the external dir.
    fs.symlinkSync(external, path.join(paths.logs, 'dream'));

    assert.ok(insecureEntries(paths).includes(path.join(paths.logs, 'dream')), 'symlinked logs/<job> flagged');
    repairPrivateModes(paths);
    assert.equal(fs.lstatSync(path.join(paths.logs, 'dream')).isSymbolicLink(), true, 'still the symlink');
    assert.equal(modeOf(external), 0o755, 'external target untouched');
    assert.equal(modeOf(externalLog), 0o644, 'external log not chmodded — not followed');
  });
});

test('private-fs: G2 — a swap-to-symlink (forced ELOOP openSync seam) on logs/<job> is refused; the rest still repairs', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    fs.chmodSync(paths.logs, 0o700);
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o777); // wants repair to 0700
    fs.writeFileSync(path.join(paths.state, 'broker-grants.json'), '{}', { mode: 0o644 }); // repairs fine

    const target = path.join(paths.logs, 'dream');
    // Simulate a swap-to-symlink between enumeration and chmod: openSync ELOOPs
    // ONLY for the target dir, delegating every other path to the real openSync.
    const openSync = (p, flags, mode) => {
      if (p === target) {
        const err = new Error('ELOOP: too many symbolic links');
        err.code = 'ELOOP';
        throw err;
      }
      return fs.openSync(p, flags, mode);
    };

    const r = repairPrivateModes(paths, { openSync });
    assert.equal(modeOf(target), 0o777, 'the refused (ELOOP) entry was NOT chmodded');
    assert.equal(modeOf(path.join(paths.state, 'broker-grants.json')), 0o600, 'the rest of the repair still completed');
    assert.ok(r.changed >= 1, 'other entries were repaired');
    // Surfaced: the still-0777 real dir is reported by the predicate.
    assert.ok(insecureEntries(paths).includes(target), 'the refused entry stays flagged (surfaced, not silent)');
  });
});

test('private-fs: G3 — an intermediate-swap redirects the file open to a different inode → fchmod REFUSED, external untouched', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.logs, 0o700);
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o700);
    const coreLog = path.join(paths.logs, 'dream', 'run.log');
    fs.writeFileSync(coreLog, 'in', { mode: 0o644 });
    // The out-of-tree file an intermediate-dir swap would redirect the open to.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-'));
    const externalFile = path.join(external, 'outside.log');
    fs.writeFileSync(externalFile, 'out', { mode: 0o644 });

    // Simulate the swap: when repair opens the classified core log, the open
    // lands on the EXTERNAL file's fd (different inode). The (dev,ino)
    // revalidation must then refuse the fchmod.
    let externalFd = null;
    const openSync = (p, flags, mode) => {
      if (p === coreLog) {
        externalFd = fs.openSync(externalFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        return externalFd;
      }
      return fs.openSync(p, flags, mode);
    };

    repairPrivateModes(paths, { openSync });
    assert.equal(modeOf(externalFile), 0o644, 'the redirected external file was NOT chmodded to 0600');
    assert.equal(modeOf(coreLog), 0o644, 'the core log stayed wrong-moded (refused), so it is surfaced');
    assert.ok(insecureEntries(paths).includes(coreLog), 'the refused entry is surfaced by the predicate');
  });
});

test('private-fs: G3 — the same (dev,ino) revalidation guards the DIRECTORY chmod', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.logs, 0o700);
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o777); // wants repair
    const target = path.join(paths.logs, 'dream');
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-'));
    fs.chmodSync(external, 0o777);

    const openSync = (p, flags, mode) => {
      if (p === target) return fs.openSync(external, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0));
      return fs.openSync(p, flags, mode);
    };

    repairPrivateModes(paths, { openSync });
    assert.equal(modeOf(external), 0o777, 'the redirected external dir was NOT chmodded to 0700');
    assert.equal(modeOf(target), 0o777, 'the target dir stayed wrong-moded (refused) and is surfaced');
    assert.ok(insecureEntries(paths).includes(target), 'surfaced');
  });
});

test('private-fs: G4a — a NON-000 EACCES (write-only 0200 file) is refused, never falls back to chmod', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    const f = path.join(paths.state, 'broker-grants.json');
    fs.writeFileSync(f, '{}');
    fs.chmodSync(f, 0o200); // write-only → O_RDONLY EACCES, but NOT mode-000

    const r = repairPrivateModes(paths);
    assert.equal(modeOf(f), 0o200, 'a non-000 EACCES file is refused, not chmodded to 0600');
    assert.equal(r.changed, 0, 'nothing counted as changed for it');
    assert.ok(insecureEntries(paths).includes(f), 'surfaced as wrong-moded');
  });
});

test('private-fs: F4 — a (dev,ino) change between the fallback lstat and re-lstat surfaces LOUDLY (repair throws)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.secrets, 0o000); // the only repairable entry; forces the EACCES fallback

    const real = fs.lstatSync(paths.secrets);
    const chmodCalls = [];
    // Real open (000 → EACCES → fallback). chmodSync is a NOOP so the real dir
    // stays 000. lstatSync seam: first (pre-chmod) call returns the real 000
    // stat; the post-chmod re-lstat returns a DIFFERENT inode → the mode-000
    // window swap must surface LOUDLY: repairPrivateModes THROWS (F4), not a
    // silent changed:0.
    let lstatCalls = 0;
    const seams = {
      chmodSync: (p, m) => chmodCalls.push([p, m]),
      lstatSync: (p) => {
        if (p !== paths.secrets) return fs.lstatSync(p);
        lstatCalls += 1;
        if (lstatCalls === 1) return real; // pre-chmod: real 000, matching dev/ino
        return { ...real, ino: real.ino + 1, isSymbolicLink: () => false, isDirectory: () => true, mode: real.mode };
      },
    };

    assert.throws(
      () => repairPrivateModes(paths, seams),
      (err) => err instanceof WienerdogError && /changed identity between the permission read and the chmod/.test(err.message),
      'the mode-000 post-chmod swap is surfaced loudly, not a silent changed:0'
    );
    assert.deepEqual(chmodCalls, [[paths.secrets, 0o700]], 'the fallback DID attempt the chmod before detecting the swap');
  });
});

test('private-fs: G5 — a symlinked CORE is refused as the root; NOTHING beneath the external target is chmodded', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root); // paths.core = root/wd (does not exist yet)
    // The EXTERNAL tree the attacker's symlinked core would point at, with the
    // usual wrong modes.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-core-'));
    fs.chmodSync(external, 0o755);
    fs.mkdirSync(path.join(external, 'state'), { recursive: true });
    fs.chmodSync(path.join(external, 'state'), 0o755);
    fs.mkdirSync(path.join(external, 'logs', 'dream'), { recursive: true });
    fs.chmodSync(path.join(external, 'logs'), 0o755);
    fs.chmodSync(path.join(external, 'logs', 'dream'), 0o777);
    fs.mkdirSync(path.join(external, 'secrets'), { recursive: true });
    fs.chmodSync(path.join(external, 'secrets'), 0o755);
    fs.writeFileSync(path.join(external, 'secrets', 'google-token.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(external, 'state', 'broker-grants.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(external, 'config.yaml'), 'vault: null\n', { mode: 0o644 });
    // core IS a symlink to that external tree.
    fs.symlinkSync(external, paths.core);

    // Predicate surfaces ONLY the core anomaly.
    assert.deepEqual(insecureEntries(paths), [paths.core], 'only the symlinked core is flagged');

    const r = repairPrivateModes(paths);
    assert.equal(r.changed, 0, 'nothing beneath an untrusted core is chmodded');
    // Every external mode is byte-for-byte unchanged.
    assert.equal(modeOf(external), 0o755, 'external core dir untouched');
    assert.equal(modeOf(path.join(external, 'state')), 0o755, 'external state/ untouched');
    assert.equal(modeOf(path.join(external, 'logs', 'dream')), 0o777, 'external logs/dream/ untouched');
    assert.equal(modeOf(path.join(external, 'secrets')), 0o755, 'external secrets/ untouched');
    assert.equal(modeOf(path.join(external, 'secrets', 'google-token.json')), 0o644, 'external token untouched');
    assert.equal(modeOf(path.join(external, 'state', 'broker-grants.json')), 0o644, 'external grant untouched');
    assert.equal(modeOf(path.join(external, 'config.yaml')), 0o644, 'external config untouched');
    // Still the sole anomaly after repair (surfaced, never fixed-through).
    assert.deepEqual(insecureEntries(paths), [paths.core]);
  });
});

test('private-fs: G5 — a REAL core reached via a symlinked ANCESTOR is NOT a false anomaly and repairs fully', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-realroot-'));
    // A symlinked ANCESTOR above a REAL core (mirrors macOS /Users→…/Data/Users).
    const ancestorLink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-anc-')), 'home');
    fs.symlinkSync(realRoot, ancestorLink); // ancestorLink → realRoot (a real dir)
    const paths = pathsFor(ancestorLink); // core = ancestorLink/wd — a REAL dir under a symlinked ancestor
    // Build a real nested tree with wrong modes UNDER the real root.
    fs.mkdirSync(path.join(realRoot, 'wd', 'state'), { recursive: true });
    fs.chmodSync(path.join(realRoot, 'wd'), 0o755);
    fs.chmodSync(path.join(realRoot, 'wd', 'state'), 0o755);
    fs.mkdirSync(path.join(realRoot, 'wd', 'secrets'), { recursive: true });
    fs.chmodSync(path.join(realRoot, 'wd', 'secrets'), 0o755);
    fs.writeFileSync(path.join(realRoot, 'wd', 'secrets', 'google-token.json'), '{}', { mode: 0o644 });

    // Not flagged as a core anomaly — the core's FINAL component is a real dir.
    assert.ok(!insecureEntries(paths).includes(paths.core) || modeOf(paths.core) !== 0o700, 'core is enumerated as a real dir, not a symlink anomaly');
    const r = repairPrivateModes(paths);
    assert.ok(r.changed >= 3, `the real tree under a symlinked ancestor repairs fully (got ${r.changed})`);
    assert.equal(modeOf(paths.core), 0o700, 'real core repaired');
    assert.equal(modeOf(path.join(realRoot, 'wd', 'secrets')), 0o700, 'secrets/ repaired');
    assert.equal(modeOf(path.join(realRoot, 'wd', 'secrets', 'google-token.json')), 0o600, 'token repaired');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'clean after repair — no false ancestor anomaly');
  });
});

test('private-fs: F2 — a DYNAMIC leaf symlink in EVERY dynamic collection is surfaced as an anomaly and never chmodded', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    // Real, correctly-moded private dirs so ONLY the dynamic leaf symlinks stand out.
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.mkdirSync(path.join(paths.state, 'dream-scratch'), { recursive: true });
    fs.mkdirSync(path.join(paths.state, 'quarantine'), { recursive: true });
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    for (const d of [paths.core, paths.state, paths.logs, paths.secrets,
      path.join(paths.state, 'dream-scratch'), path.join(paths.state, 'quarantine'),
      path.join(paths.logs, 'dream')]) fs.chmodSync(d, 0o700);

    // One external 0644 file per dynamic collection, each reached via a leaf symlink
    // whose NAME matches that collection's filter.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-leaf-'));
    const targets = {
      [path.join(paths.secrets, 'google-token.json')]: path.join(external, 'sec-target'),
      [path.join(paths.logs, 'dream', 'run.log')]: path.join(external, 'log-target'),
      [path.join(paths.state, 'dream-scratch', 'a.json')]: path.join(external, 'scratch-target'),
      [path.join(paths.state, 'quarantine', 'q.md')]: path.join(external, 'quar-target'),
    };
    for (const [link, tgt] of Object.entries(targets)) {
      fs.writeFileSync(tgt, 'x', { mode: 0o644 });
      fs.symlinkSync(tgt, link);
    }

    const flagged = insecureEntries(paths);
    for (const link of Object.keys(targets)) {
      assert.ok(flagged.includes(link), `dynamic leaf symlink surfaced as anomaly: ${link}`);
    }
    assert.equal(scanPrivateModes(paths).insecure, 4, 'exactly the four dynamic leaf symlinks are flagged');

    repairPrivateModes(paths);
    for (const [link, tgt] of Object.entries(targets)) {
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true, `${link} still the symlink`);
      assert.equal(modeOf(tgt), 0o644, `external target of ${link} NOT chmodded`);
    }
  });
});

test('private-fs: repairPrivateModes never creates secrets/ or any file (repair, never create)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
  const paths = pathsFor(root);
  fs.mkdirSync(paths.core, { recursive: true, mode: 0o700 });
  assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'nothing to repair, nothing created');
  assert.equal(fs.existsSync(paths.secrets), false, 'no secrets/ was created');
  assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'a machine with no Google setup scans clean');
});

test('private-fs: scanPrivateModes counts group/world-accessible entries read-only; insecureEntries agrees', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(paths.state, 'digest.md'), 'd', { mode: 0o644 });
    fs.chmodSync(paths.core, 0o700);

    const before = scanPrivateModes(paths);
    assert.equal(before.insecure, 2, 'state dir + digest.md are insecure');
    assert.equal(insecureEntries(paths).length, before.insecure, 'the two surfaces agree');
    assert.equal(modeOf(paths.state), 0o755, 'scan never chmods');

    repairPrivateModes(paths);
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
    assert.deepEqual(insecureEntries(paths), []);
  });
});

test('private-fs: missing dirs/files are skipped, never thrown', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
  const paths = pathsFor(root); // nothing exists
  assert.deepEqual(repairPrivateModes(paths), { changed: 0 });
  assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
});

test('private-fs: the A5-scoped set matches the OWNER-APPROVED membership', () => {
  const paths = pathsFor('/tmp/x');
  const dirs = A5_PRIVATE_DIRS(paths);
  assert.deepEqual(dirs, [
    paths.core,
    paths.state,
    paths.logs,
    path.join(paths.state, 'dream-scratch'),
    path.join(paths.state, 'quarantine'),
  ]);
  assert.ok(!dirs.includes(paths.secrets), 'secrets is A9, not in the A5 constant');
  assert.deepEqual(A5_PRIVATE_FILE_BASENAMES, [
    'digest.md',
    'alerts.jsonl',
    'transcript-ledger.json',
    'identity-approvals.json',
  ]);
});

test('private-fs: the A9-scoped set matches the spec membership (WP-a9)', () => {
  const paths = pathsFor('/tmp/x');
  assert.deepEqual(A9_PRIVATE_DIRS(paths), [paths.secrets]);
  assert.deepEqual(A9_PRIVATE_STATE_FILES, [
    'broker-grants.json',
    'exec-pins.json',
    'run-evidence.jsonl',
    'schedule.json',
    'watermarks.json',
  ]);
  assert.deepEqual(A9_PRIVATE_CORE_FILES(paths), [paths.config, paths.manifest]);
});

// ── createLogStreamPrivate: the fail-closed 0600 log-stream helper (WP-a9) ──

/** Write `data` through a stream and wait for the flush. */
function writeAndEnd(stream, data) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.end(data, resolve);
  });
}

test('private-fs: createLogStreamPrivate writes a fresh 0600 log under umask 000', { skip: !POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'run.log');
  await withUmask(0o000, async () => {
    const stream = createLogStreamPrivate(file);
    await writeAndEnd(stream, 'hello\n');
  });
  assert.equal(modeOf(file), 0o600, 'fresh log is 0600 despite umask 000');
  assert.equal(fs.readFileSync(file, 'utf8'), 'hello\n');
});

test('private-fs: createLogStreamPrivate re-secures a pre-existing 0666 append target to 0600', { skip: !POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'daily.log');
  fs.writeFileSync(file, 'old\n');
  fs.chmodSync(file, 0o666); // the legacy world-readable daily log
  const stream = createLogStreamPrivate(file, { flags: 'a' });
  await writeAndEnd(stream, 'new\n');
  assert.equal(modeOf(file), 0o600, 'legacy 0666 append target ends 0600');
  assert.equal(fs.readFileSync(file, 'utf8'), 'old\nnew\n', 'append semantics preserved');
});

test('private-fs: createLogStreamPrivate is FAIL-CLOSED — fchmod failure throws, closes the fd, writes ZERO bytes', { skip: !POSIX }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'refused.log');
  const closed = [];
  assert.throws(
    () =>
      createLogStreamPrivate(file, {
        fchmodSync: () => {
          throw new Error('EPERM: not yours');
        },
        closeSync: (fd) => {
          closed.push(fd);
          fs.closeSync(fd);
        },
      }),
    (err) => err instanceof WienerdogError && /could not secure it to 0600/.test(err.message)
  );
  assert.equal(closed.length, 1, 'the fd was closed on failure');
  assert.equal(fs.statSync(file).size, 0, 'zero log bytes written — never into an unsecured file');
});

test('private-fs: createLogStreamPrivate on win32 is a plain stream (no chmod semantics)', { skip: POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'win.log');
  const stream = createLogStreamPrivate(file);
  await writeAndEnd(stream, 'x');
  assert.equal(fs.readFileSync(file, 'utf8'), 'x');
});

test('private-fs: F1a — createLogStreamPrivate REFUSES a pre-existing symlinked log; external target + bytes UNCHANGED', { skip: !POSIX }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-log-'));
  const externalFile = path.join(external, 'outside.log');
  fs.writeFileSync(externalFile, 'external content\n', { mode: 0o644 });
  // The daily log path IS a pre-existing symlink → the external file.
  const logPath = path.join(root, 'daily.log');
  fs.symlinkSync(externalFile, logPath);

  // Both append and truncate sites must refuse (O_NOFOLLOW → ELOOP → throw).
  for (const flags of ['a', 'w']) {
    assert.throws(
      () => createLogStreamPrivate(logPath, { flags }),
      (err) => err instanceof WienerdogError && /without following a symlink|could not secure/.test(err.message),
      `flags=${flags} must fail-closed on a symlinked target`
    );
  }
  assert.equal(modeOf(externalFile), 0o644, 'the external target was NOT chmodded to 0600');
  assert.equal(fs.readFileSync(externalFile, 'utf8'), 'external content\n', 'no bytes written through the symlink');
});

test('private-fs: F1b — mkdirPrivate REFUSES a pre-existing symlinked logs/<job>; external dir UNCHANGED', { skip: !POSIX }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-dir-'));
  fs.chmodSync(external, 0o777);
  const logDir = path.join(root, 'logs', 'dream');
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  fs.symlinkSync(external, logDir); // logs/dream IS a symlink to the external dir

  assert.throws(
    () => mkdirPrivate(logDir),
    (err) => err instanceof WienerdogError && /symlink is in the way/.test(err.message),
    'mkdirPrivate must refuse a symlinked target before any chmod'
  );
  assert.equal(modeOf(external), 0o777, 'the external dir was NOT chmodded to 0700');
});

test('private-fs: F5 — a symlinked CORE or LOGS ancestor makes the write helpers REFUSE; external tree UNCHANGED', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    // (1) symlinked CORE: paths.core → external tree.
    {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
      const paths = pathsFor(root);
      const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-core-'));
      fs.chmodSync(external, 0o755);
      fs.mkdirSync(path.join(external, 'logs', 'dream'), { recursive: true });
      fs.chmodSync(path.join(external, 'logs', 'dream'), 0o777);
      const externalLog = path.join(external, 'logs', 'dream', 'x.log');
      fs.writeFileSync(externalLog, 'ext', { mode: 0o644 });
      fs.symlinkSync(external, paths.core); // core IS a symlink

      const logDir = path.join(paths.logs, 'dream');
      assert.throws(() => mkdirPrivate(logDir, { core: paths.core }),
        (e) => e instanceof WienerdogError && /core is a symlink/.test(e.message), 'mkdirPrivate refuses a symlinked core');
      assert.throws(() => createLogStreamPrivate(path.join(logDir, 'y.log'), { core: paths.core }),
        (e) => e instanceof WienerdogError && /core is a symlink/.test(e.message), 'createLogStreamPrivate refuses a symlinked core');
      assert.equal(modeOf(path.join(external, 'logs', 'dream')), 0o777, 'external logs/dream NOT chmodded');
      assert.equal(modeOf(externalLog), 0o644, 'external log NOT touched');
    }
    // (2) symlinked intermediate LOGS: core real, logs → external dir.
    {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
      const paths = pathsFor(root);
      fs.mkdirSync(paths.core, { recursive: true });
      fs.chmodSync(paths.core, 0o700);
      const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-logs-'));
      fs.chmodSync(external, 0o755);
      fs.mkdirSync(path.join(external, 'dream'), { recursive: true });
      fs.chmodSync(path.join(external, 'dream'), 0o777);
      fs.symlinkSync(external, paths.logs); // logs IS a symlink (intermediate ancestor)

      const logDir = path.join(paths.logs, 'dream');
      assert.throws(() => mkdirPrivate(logDir, { core: paths.core }),
        (e) => e instanceof WienerdogError && /ancestor .* is a symlink/.test(e.message), 'mkdirPrivate refuses a symlinked logs ancestor');
      assert.throws(() => createLogStreamPrivate(path.join(logDir, 'z.log'), { core: paths.core }),
        (e) => e instanceof WienerdogError && /ancestor .* is a symlink/.test(e.message), 'createLogStreamPrivate refuses a symlinked logs ancestor');
      assert.equal(modeOf(path.join(external, 'dream')), 0o777, 'external logs/<job> NOT chmodded via the symlinked ancestor');
    }
  });
});

test('private-fs: F6 — writeFilePrivate ignores a planted PREDICTABLE temp symlink; external target byte+mode UNCHANGED, dest a real 0600 file', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-tmp-'));
    const externalTarget = path.join(external, 'stolen');
    fs.writeFileSync(externalTarget, 'SECRET', { mode: 0o644 });
    const dest = path.join(paths.state, 'broker-grants.json');
    // Plant the OLD predictable temp name (basename + PID) as a symlink → external.
    const predictable = path.join(paths.state, `.broker-grants.json.${process.pid}.tmp`);
    fs.symlinkSync(externalTarget, predictable);

    writeFilePrivate(dest, '{"grants":[]}', { core: paths.core });

    // The random temp name never touched the predictable symlink's external target.
    assert.equal(fs.readFileSync(externalTarget, 'utf8'), 'SECRET', 'external target bytes UNCHANGED');
    assert.equal(modeOf(externalTarget), 0o644, 'external target mode UNCHANGED');
    assert.equal(fs.readlinkSync(predictable), externalTarget, 'the planted predictable symlink was never followed/replaced');
    // dest is a real in-core 0600 file with our content.
    assert.equal(fs.lstatSync(dest).isSymbolicLink(), false, 'dest is a real file, not a symlink');
    assert.equal(fs.readFileSync(dest, 'utf8'), '{"grants":[]}');
    assert.equal(modeOf(dest), 0o600, 'dest is 0600');
  });
});

test('private-fs: F6 — writeFilePrivate temp uses O_EXCL|O_NOFOLLOW and retries on EEXIST at the random name', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    const dest = path.join(paths.state, 'watermarks.json');
    let calls = 0;
    let sawExcl = false;
    let sawNofollow = false;
    const realOpen = fs.openSync;
    const openSync = (p, flags, mode) => {
      if (typeof flags === 'number') {
        sawExcl = sawExcl || (flags & fs.constants.O_EXCL) !== 0;
        sawNofollow = sawNofollow || (flags & (fs.constants.O_NOFOLLOW || 0)) !== 0;
      }
      calls += 1;
      if (calls === 1) {
        const e = new Error('EEXIST: file already exists'); // simulate a collision/symlink at the first random name
        e.code = 'EEXIST';
        throw e;
      }
      return realOpen(p, flags, mode);
    };

    writeFilePrivate(dest, 'data', { core: paths.core, openSync });
    assert.ok(sawExcl && sawNofollow, 'the temp is opened O_EXCL|O_NOFOLLOW');
    assert.ok(calls >= 2, 'EEXIST at the first random name → retried with a fresh random name');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'data');
    assert.equal(modeOf(dest), 0o600);
  });
});
