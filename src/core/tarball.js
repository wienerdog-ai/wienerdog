'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('./errors');
const { isSemver } = require('./update-check');
const { appDir } = require('./vendor');

const REGISTRY = 'https://registry.npmjs.org';
const PKG = 'wienerdog';
const META_TIMEOUT_MS = 5000;              // manifest JSON GET
const TARBALL_TIMEOUT_MS = 30000;          // tarball GET (larger, bounded)
const MAX_META_BYTES = 1 * 1024 * 1024;    // 1 MiB manifest cap
const MAX_TARBALL_BYTES = 64 * 1024 * 1024; // 64 MiB tarball cap

/** Manifest URL for the `latest` dist-tag. @returns {string} */
function latestManifestUrl() { return `${REGISTRY}/${PKG}/latest`; }

/** Deterministic tarball URL for a version — CONSTRUCTED locally, never taken
 *  from registry JSON. @param {string} version @returns {string} */
function tarballUrl(version) { return `${REGISTRY}/${PKG}/-/${PKG}-${version}.tgz`; }

/** Parse & validate a `latest` manifest JSON string into the fields we use.
 *  @param {string} jsonText
 *  @returns {{version:string, integrity:string}}
 *  @throws WienerdogError on bad shape / non-semver / missing|malformed integrity */
function parseManifest(jsonText) {
  let obj;
  try { obj = JSON.parse(jsonText); } catch {
    throw new WienerdogError('could not read the registry response');
  }
  const version = obj && obj.version;
  if (!isSemver(version)) throw new WienerdogError('registry returned an invalid version');
  const integrity = obj.dist && obj.dist.integrity;
  if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
    throw new WienerdogError('registry response has no usable sha512 checksum');
  }
  return { version, integrity };
}

/** Bounded HTTPS GET collecting a utf8 string body. @param {string} url
 *  @param {number} timeoutMs @param {number} maxBytes @returns {Promise<string>} */
function httpsGetString(url, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`status ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > maxBytes) req.destroy(new Error('response too large')); });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Bounded HTTPS GET collecting a raw Buffer body. @param {string} url
 *  @param {number} timeoutMs @param {number} maxBytes @returns {Promise<Buffer>} */
function httpsGetBuffer(url, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`status ${res.statusCode}`)); return; }
      const chunks = [];
      let total = 0;
      res.on('data', (c) => { chunks.push(c); total += c.length; if (total > maxBytes) req.destroy(new Error('tarball too large')); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Fetch & validate the latest version manifest.
 * Order of resolution (first that applies):
 *   1. opts.fetchManifest(timeoutMs) → Promise<string(JSON)>  (unit-test seam)
 *   2. env WIENERDOG_TARBALL_META_CMD — single-token exec whose stdout is the
 *      manifest JSON (integration seam; mirrors WIENERDOG_UPDATE_FETCH_CMD)
 *   3. HTTPS GET latestManifestUrl(), bounded META_TIMEOUT_MS, MAX_META_BYTES cap
 * Then parseManifest() the text.
 * @param {{fetchManifest?:(t:number)=>Promise<string>}} [opts]
 * @returns {Promise<{version:string, integrity:string}>}
 */
async function fetchLatestManifest(opts = {}) {
  let text;
  if (opts.fetchManifest) {
    text = await opts.fetchManifest(META_TIMEOUT_MS);
  } else if (process.env.WIENERDOG_TARBALL_META_CMD) {
    const r = spawnSync(process.env.WIENERDOG_TARBALL_META_CMD, [], { timeout: META_TIMEOUT_MS, encoding: 'utf8' });
    if (r.status !== 0 || r.error) throw new WienerdogError('could not reach the registry');
    text = r.stdout || '';
  } else {
    text = await httpsGetString(latestManifestUrl(), META_TIMEOUT_MS, MAX_META_BYTES);
  }
  return parseManifest(text);
}

/**
 * Download the tarball bytes for a version and VERIFY sha512 BEFORE returning.
 * Resolution order:
 *   1. opts.downloadBuffer(version, timeoutMs) → Promise<Buffer>  (unit-test seam)
 *   2. env WIENERDOG_TARBALL_CMD — single-token exec whose stdout is the raw
 *      tarball bytes (spawned with encoding:'buffer')
 *   3. HTTPS GET tarballUrl(version), bounded, MAX_TARBALL_BYTES cap
 * Verify: verifyIntegrity(buf, integrity) must be true, else throw WienerdogError.
 * @param {string} version @param {string} integrity  (sha512-<base64>)
 * @param {{downloadBuffer?:(v:string,t:number)=>Promise<Buffer>}} [opts]
 * @returns {Promise<Buffer>}  the verified tarball bytes
 */
async function downloadVerified(version, integrity, opts = {}) {
  let buf;
  if (opts.downloadBuffer) {
    buf = await opts.downloadBuffer(version, TARBALL_TIMEOUT_MS);
  } else if (process.env.WIENERDOG_TARBALL_CMD) {
    const r = spawnSync(process.env.WIENERDOG_TARBALL_CMD, [], { timeout: TARBALL_TIMEOUT_MS, maxBuffer: MAX_TARBALL_BYTES });
    if (r.status !== 0 || r.error) throw new WienerdogError('could not download the update');
    buf = r.stdout;
  } else {
    buf = await httpsGetBuffer(tarballUrl(version), TARBALL_TIMEOUT_MS, MAX_TARBALL_BYTES);
  }
  if (!verifyIntegrity(buf, integrity)) {
    throw new WienerdogError('the download failed its integrity check (checksum mismatch)');
  }
  return buf;
}

/** True iff sha512(buf) base64 equals the payload of `sha512-<base64>`.
 *  Rejects (returns false) any non-sha512 / malformed integrity.
 *  @param {Buffer} buf @param {string} integrity @returns {boolean} */
function verifyIntegrity(buf, integrity) {
  if (typeof integrity !== 'string') return false;
  const m = integrity.match(/^sha512-([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return false;
  const got = crypto.createHash('sha512').update(buf).digest('base64');
  return got === m[1];
}

/**
 * Extract a verified .tgz into destDir, stripping the leading `package/`
 * component. Shells out to system `tar` (present on macOS/Linux; tar.exe on
 * Win10+). Throws WienerdogError with a plain message if `tar` is missing or
 * exits non-zero. destDir must already exist.
 * @param {string} tgzFile @param {string} destDir
 * @param {{spawn?: typeof spawnSync}} [opts]  seam for the tar-missing test
 */
function extractTarball(tgzFile, destDir, opts = {}) {
  const spawn = opts.spawn || spawnSync;
  const r = spawn('tar', ['-xzf', tgzFile, '--strip-components=1', '-C', destDir]);
  if (r.error || r.status !== 0) {
    throw new WienerdogError('could not unpack the download (is `tar` installed?)');
  }
}

/**
 * Ensure app/<version>/ exists by fetching+verifying+unpacking the tarball.
 * Idempotent: if app/<version>/bin/wienerdog.js already exists, do NOTHING and
 * return {version, target, alreadyPresent:true}. Otherwise: download+verify,
 * write the bytes to a temp .tgz, extract into a per-pid STAGING dir
 * (app/<version>.staging.<pid>), then fs.renameSync it onto app/<version>
 * (atomic publish; mirror vendorSelf). Cleans up the temp .tgz and any leftover
 * staging dir. Does NOT repoint `current` and does NOT touch the manifest.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{version:string, integrity:string,
 *          fetchManifest?:Function, downloadBuffer?:Function, spawn?:Function}} args
 *   version+integrity are REQUIRED here (the caller obtained them via
 *   fetchLatestManifest); this keeps installVersion decoupled from the network.
 * @returns {Promise<{version:string, target:string, alreadyPresent:boolean}>}
 */
async function installVersion(paths, args) {
  const { version, integrity } = args;
  if (!isSemver(version)) throw new WienerdogError('registry returned an invalid version');
  const app = appDir(paths);
  const target = path.join(app, version);
  if (fs.existsSync(path.join(target, 'bin', 'wienerdog.js'))) {
    return { version, target, alreadyPresent: true };
  }

  const buf = await downloadVerified(version, integrity, {
    downloadBuffer: args.downloadBuffer,
  });

  const staging = `${target}.staging.${process.pid}`;
  const tgzFile = path.join(os.tmpdir(), `wd-tarball-${process.pid}-${Date.now()}.tgz`);
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(tgzFile, buf);
    extractTarball(tgzFile, staging, { spawn: args.spawn });
    fs.mkdirSync(app, { recursive: true });
    fs.renameSync(staging, target); // atomic publish of the version dir
  } finally {
    try { fs.rmSync(tgzFile, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  return { version, target, alreadyPresent: false };
}

module.exports = {
  REGISTRY, PKG, latestManifestUrl, tarballUrl, parseManifest,
  fetchLatestManifest, downloadVerified, verifyIntegrity, extractTarball,
  installVersion,
};
