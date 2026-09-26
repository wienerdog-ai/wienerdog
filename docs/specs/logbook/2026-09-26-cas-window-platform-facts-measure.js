'use strict';
const fs = require('node:fs'); const path = require('node:path'); const cp = require('node:child_process');
const d = fs.mkdtempSync(path.join(__dirname, 'm', 'cas-'));
const p = (n) => path.join(d, n);
console.log('node', process.version, process.platform, 'dir', d);
try { console.log('fs type:', cp.execSync(`df -T apfs ${d} >/dev/null 2>&1 && echo apfs || stat -f %T ${d}`).toString().trim()); } catch (e) { console.log('fs type probe failed', e.message); }
// (a)
fs.writeFileSync(p('dest'), 'OLD-DEST'); fs.writeFileSync(p('tmp'), 'NEW-TMP');
// (b)
try { fs.linkSync(p('tmp'), p('dest')); console.log('(b) linkSync onto existing: SUCCEEDED (unexpected)'); } catch (e) { console.log('(b) linkSync onto existing dest ->', e.code, e.errno, '| dest still:', fs.readFileSync(p('dest'),'utf8')); }
// (b2) link onto dangling symlink
fs.symlinkSync(p('nowhere'), p('dangling'));
try { fs.linkSync(p('tmp'), p('dangling')); console.log('(b2) linkSync onto dangling symlink: SUCCEEDED'); } catch (e) { console.log('(b2) linkSync onto dangling symlink ->', e.code); }
// (c)
try { fs.openSync(p('dest'), 'wx'); console.log('(c) wx: SUCCEEDED (unexpected)'); } catch (e) { console.log("(c) openSync(dest,'wx') on existing ->", e.code, e.errno); }
try { fs.openSync(p('dangling'), 'wx'); console.log('(c2) wx on dangling symlink: SUCCEEDED'); } catch (e) { console.log("(c2) openSync(dangling,'wx') ->", e.code); }
// (d)
fs.linkSync(p('tmp'), p('fresh'));
const a = fs.statSync(p('tmp')), b = fs.statSync(p('fresh'));
console.log('(d) link fresh: tmp.ino', a.ino, 'fresh.ino', b.ino, 'same:', a.ino === b.ino, 'nlink', b.nlink, 'content', fs.readFileSync(p('fresh'),'utf8'));
fs.unlinkSync(p('tmp')); console.log('(d) after unlink tmp: fresh nlink', fs.statSync(p('fresh')).nlink);
// (e)
const before = fs.statSync(p('dest')).ino; const fd = fs.openSync(p('dest'), 'r');
fs.writeFileSync(p('other'), 'REPLACEMENT'); fs.renameSync(p('other'), p('dest'));
const after = fs.statSync(p('dest')).ino; const fst = fs.fstatSync(fd);
const buf = Buffer.alloc(64); const n = fs.readSync(fd, buf, 0, 64, 0);
console.log('(e) dest ino before', before, 'after rename', after, 'changed:', before !== after);
console.log('(e) held fd: fstat.ino', fst.ino, 'nlink', fst.nlink, 'reads:', JSON.stringify(buf.subarray(0,n).toString()), '| path reads:', JSON.stringify(fs.readFileSync(p('dest'),'utf8')));
fs.closeSync(fd);
// (f) in-place write under held fd, for contrast
const fd2 = fs.openSync(p('dest'), 'r'); fs.writeFileSync(p('dest'), 'INPLACE-EDIT');
const n2 = fs.readSync(fd2, buf, 0, 64, 0); console.log('(f) in-place writeFileSync: ino', fs.statSync(p('dest')).ino, 'held fd reads', JSON.stringify(buf.subarray(0,n2).toString()));
fs.closeSync(fd2);
// (g) is RENAME_EXCL / renameat2 reachable? list fs exports with rename in name, constants
console.log('(g) fs keys matching /rename|link|exch|swap/i:', Object.keys(fs).filter(k=>/rename|link|exch|swap/i.test(k)).join(','));
console.log('(g) fs.constants keys matching /RENAME|EXCL|SWAP|NOREPLACE/:', Object.keys(fs.constants).filter(k=>/RENAME|EXCL|SWAP|NOREPLACE/.test(k)).join(','));
fs.rmSync(d, { recursive: true, force: true });
