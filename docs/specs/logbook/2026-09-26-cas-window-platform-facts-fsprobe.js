'use strict';
const fs=require('node:fs'),path=require('node:path');
const d=process.argv[2]; const p=n=>path.join(d,n);
for (const n of ['dest','tmp','fresh','other']) { try{fs.unlinkSync(p(n))}catch{} }
fs.writeFileSync(p('dest'),'OLD'); fs.writeFileSync(p('tmp'),'NEW');
const r=[];
try{fs.linkSync(p('tmp'),p('dest'));r.push('link->existing: OK?!')}catch(e){r.push('link->existing: '+e.code)}
try{fs.linkSync(p('tmp'),p('fresh'));const a=fs.statSync(p('tmp')),b=fs.statSync(p('fresh'));r.push(`link->fresh: OK sameIno=${a.ino===b.ino} nlink=${b.nlink}`)}catch(e){r.push('link->fresh: '+e.code)}
try{fs.openSync(p('dest'),'wx');r.push('wx existing: OK?!')}catch(e){r.push('wx existing: '+e.code)}
const fd=fs.openSync(p('dest'),'r'); const i0=fs.fstatSync(fd).ino;
fs.writeFileSync(p('other'),'REPL'); fs.renameSync(p('other'),p('dest'));
const b=Buffer.alloc(16); const n=fs.readSync(fd,b,0,16,0);
r.push(`rename over held fd: pathIno ${i0}->${fs.statSync(p('dest')).ino} heldReads=${b.subarray(0,n)}`); fs.closeSync(fd);
console.log(process.argv[3].padEnd(8), r.join(' | '));
