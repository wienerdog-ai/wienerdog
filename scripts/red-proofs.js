#!/usr/bin/env node
/**
 * THE RED-PROOF RUNNER (WP-criterion-red-harness).
 *
 *   node scripts/red-proofs.js [--root <dir>] [--wp <WP-id>] [--proof <proof-id>]
 *
 * WHY THIS EXISTS. This repo's evidence rule is both-directions: a verification
 * step is trusted only after a real green on the compliant state AND a real red
 * on a deliberately broken one. The rule is sound; keeping it BY HAND is what
 * failed. Across the promote-in family's review rounds, more than ten vacuous
 * (false-green) assertions were found — every one of them by mutation or by
 * value-dumping, none by an existence check or a criterion-to-test-name
 * mapping, which is structurally blind to the class. Three of the six measured
 * failure shapes were failures of the EVIDENCE-GATHERING itself: mutations
 * never applied because shell escaping mangled the injection (and the unapplied
 * runs read as greens); a probe that located the git index THROUGH the seam it
 * was measuring; and infrastructure that died silently while reporting
 * 3 pass / 0 fail. This runner makes those preconditions machine-checked.
 *
 * WHAT IT DOES, PHASE BY PHASE. For each RED proof — one exact-substring
 * mutation plus the assertions it must redden:
 *
 *   LOAD      declarations are read with JSON.parse and NEVER executed; every
 *             field is validated as data. A violation is an ERROR naming the
 *             declaration file and the proof id — never a skip, never a pass.
 *   SNAPSHOT  ONE snapshot of the --root tree, plus a manifest over its declared
 *             domain (every entry except `.git/` and `node_modules/`; type, mode
 *             bits, size and content digest per file; type and mode per
 *             directory, so an empty directory's loss is detectable). A symlink,
 *             device, socket or FIFO in the domain is an ERROR naming its path.
 *   COPY      each phase gets its OWN copy, derived from that one snapshot and
 *             verified against the manifest BEFORE use. No `node_modules`, no
 *             dependency link, no symlink. A copy is either written by the
 *             runner (before any child starts in it) or executed (after which
 *             the runner writes nothing into it) — never both, in that order.
 *   BASELINE  a PRISTINE copy runs green and each declared identity is observed
 *             exactly once as a terminal PASS.
 *   APPLY     into a FRESH copy no child has run in: `file` canonicalises inside
 *             it, `find` occurs exactly `occurrences` times left-to-right and
 *             non-overlapping, `marker` is absent, every counted occurrence is
 *             replaced, and the WRITTEN BYTES EQUAL the expected post-mutation
 *             bytes — not merely "the digest changed", which a partial or
 *             overlapping replacement also satisfies. `marker` present after.
 *   RED       the mutated copy runs the suite; the observed OWN-BODY failing
 *             identity set EQUALS the declared set, each failure is a test-code
 *             ASSERTION failure of that test's own body, and each diagnostic
 *             carries its `signal`.
 *   CONTROL   nothing is restored, because nothing was mutated in place: the
 *             control is a FRESH pristine copy run AFTER RED, and it must be
 *             green. A pair resting on BASELINE's earlier green alone is
 *             UNCONTROLLED and is not PROVEN.
 *   REPORT    per-proof verdicts, a (wp, criterion) roll-up that reports PROVEN
 *             only when every declaration for that pair was selected, ran and
 *             passed, and the REACH footer below.
 *
 * THE INVARIANT: NO TWO PHASES SHARE ANY WRITABLE PATH THE RUNNER PROVIDES, and
 * the runner never writes into a tree in which suite code has already run. The
 * qualifier is load-bearing, not hedging — see the LANE LIMIT in REACH.
 *
 * WHY DECLARATIONS ARE DATA AND NOT CODE. LOAD runs before SANDBOX exists, so an
 * executable declaration would run BEFORE there is any confinement: a
 * `.proofs.js` calling `process.exit(0)` would end the run successfully before a
 * single proof was counted, and one calling `fs.writeFileSync` would write into
 * the real checkout before the copy was made. "No dependencies" is a convention,
 * not a mechanism. JSON has no execution semantics, so neither attack has a
 * surface: declarations are loaded with `JSON.parse` and never with `require`,
 * `import`, `eval` or a `Function` constructor.
 *
 * NO PRODUCTION SEAM IS BORROWED. This file requires nothing under `src/` and
 * nothing outside Node's standard library, and spawns no `git`. Instrumentation
 * through the production seam is itself an unrecognised call under a
 * default-deny guard — measured, and the reason the rule exists. The redirected
 * variable list below is carried as a CONSTANT for the same reason; the
 * runner's own suite (`tests/unit/red-proofs.test.js`) is what asserts it still
 * covers `src/core/paths.js`'s `OVERRIDE_VARS`, so drift fails `npm test`
 * rather than only failing when the lane runs.
 *
 * THE LANE'S NODE FLOOR IS NOT THE REPOSITORY'S. `--test-reporter=tap` landed in
 * Node 18.15.0 and `--test-name-pattern` in 18.11.0, while `package.json`
 * declares `>=18`. This runner refuses below 18.15.0 with `UNSUPPORTED` rather
 * than passing vacuously; `npm test` and every other entry point are unaffected.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

/** The lane's own Node floor: `--test-reporter=tap` landed in 18.15.0. */
const NODE_FLOOR = [18, 15, 0];

/**
 * THE HOSTS WHERE THIS LANE REFUSES TO RUN, and why the refusal is the honest
 * answer rather than a caveat.
 *
 * Table B row 2b's isolation is enforced with MODE BITS: the copies' parent, the
 * sandbox above it and the snapshot are made non-writable for each child's
 * lifetime. Mode bits are INERT for uid 0 — root bypasses the permission check
 * entirely — and Windows does not implement POSIX modes, so `chmod 0500` there
 * changes nothing a child must obey. On either host a stateful suite can write
 * `../sentinel` or `../../counter`, communicate between phases, and drive a
 * false PROVEN, while every check the runner performs still passes.
 *
 * So the runner refuses, in the same `UNSUPPORTED` class as the Node floor and
 * with the same message shape: a lane that cannot demonstrate its own isolation
 * must not report on anybody else's evidence. CI is unaffected — its ubuntu and
 * macOS runners execute as a non-root user on POSIX.
 *
 * @param {{platform?:string, uid?:number|null}} [host]
 * @returns {string|null} the reason to refuse, or null when the host can enforce it
 */
function unsupportedHostReason(host = {}) {
  const platform = host.platform === undefined ? process.platform : host.platform;
  const uid = host.uid === undefined
    ? (typeof process.getuid === 'function' ? process.getuid() : null)
    : host.uid;
  if (platform === 'win32') {
    return 'this lane needs POSIX mode bits to hold the phase copies\' parent, the sandbox and the '
      + 'snapshot non-writable while a child runs (Table B row 2b); win32 does not implement them, '
      + 'so the isolation cannot be enforced and no verdict here would mean anything';
  }
  if (uid === 0) {
    return 'this lane needs mode bits to hold the phase copies\' parent, the sandbox and the '
      + 'snapshot non-writable while a child runs (Table B row 2b); running as uid 0 (root) '
      + 'bypasses every permission check, so the isolation cannot be enforced. Run as a normal user';
  }
  return null;
}

/** Repo-relative location of this runner — a `file` may never name it. */
const RUNNER_REL = 'scripts/red-proofs.js';

/** `--root` implies this declaration directory. One flag, not two. */
const DECL_DIR_REL = 'tests/red-proofs';

/** The tree's own test entry — a path the runner NEEDS to operate, so a `file`
 *  may never resolve to it (Table A's `file` row). */
const SUITE_ENTRY_REL = 'tests/run.js';

/** Excluded from the snapshot domain by declaration, not by implementation note. */
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);

/** Per-phase scratch, all inside the phase's OWN copy so it dies with it. */
const PHASE_TMP = '.red-proofs-tmp';
const PHASE_HOME = '.red-proofs-home';
const PHASE_XDG = '.red-proofs-xdg';
/** Names the runner creates inside a copy AFTER it is manifest-verified. */
const PHASE_DIRS = [PHASE_TMP, PHASE_HOME, PHASE_XDG];

/**
 * THE WIENERDOG NAMES THE RUNNER STRIPS FROM EVERY PHASE ENVIRONMENT.
 *
 * This must cover `src/core/paths.js`'s exported `OVERRIDE_VARS` — measured:
 * running the adopted row with an ambient absolute `WIENERDOG_CLAUDE_DIR` made
 * BASELINE FAIL with the git-seam canary unexercised, the developer's own
 * environment breaking the lane. The runner carries the list as a constant and
 * imports nothing from `src/`; `tests/unit/red-proofs.test.js` asserts the
 * coverage, so a name added to `paths.js` fails `npm test`.
 *
 * REMOVED rather than pointed at a runner-chosen directory, and the reason is
 * measured: every one of these names defaults to a location UNDER `HOME`
 * (`~/.wienerdog`, `~/wienerdog`, `~/.claude`, `~/.codex`), and `HOME` is
 * already redirected into the phase's own copy — so removing them puts their
 * effective roots inside that copy exactly as setting them would, WITHOUT
 * overriding a value the suite itself sets. Setting them is not equivalent:
 * `getPaths` gives `WIENERDOG_CLAUDE_DIR` precedence over `CLAUDE_CONFIG_DIR`
 * (`src/core/paths.js`), so a runner-chosen value would beat the per-test value
 * a suite installs and redden BASELINE — measured on the adopted suite.
 */
const REDIRECTED_ENV_VARS = [
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'WIENERDOG_CLAUDE_DIR',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
];

/**
 * THE npm-PROVIDED NAMES THAT POINT AT THE REAL CHECKOUT, removed from every
 * phase environment exactly as the Wienerdog override names are (Decision 1).
 *
 * `npm run red-proofs` is the documented entry point, and npm exports several
 * variables naming the directory it was invoked from. Spawning with `cwd:` moves
 * the process; it does not touch these. MEASURED by dumping the child's whole
 * environment under `npm run` and keeping every variable whose value IS the
 * checkout or lies inside it: `INIT_CWD`, `PWD`, `npm_config_local_prefix`,
 * `npm_package_json` — and `PATH`, which carries `<root>/node_modules/.bin`.
 *
 * `PWD` is SET to the phase copy rather than removed (it has a correct value
 * here); `PATH` is SANITISED rather than removed (a suite legitimately needs
 * `git` and friends on it); the rest are removed, because their only meaning is
 * "where npm was invoked", which is precisely what a phase must not learn.
 */
const NPM_CWD_VARS = ['INIT_CWD', 'npm_config_local_prefix', 'npm_package_json'];

/** The XDG names redirected into each phase's own copy. */
const XDG_VARS = ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME'];

/**
 * Node's OWN test-runner marks, stripped so a phase child is never mistaken for
 * a nested test-runner worker. MEASURED: with `NODE_TEST_CONTEXT=child-v8` in
 * the environment (which is exactly what `npm test` gives this runner when its
 * own suite drives it), the phase child emits the v8-serialized reporter stream
 * instead of TAP, and every declared identity reads as "did not run" — a
 * false ERROR produced by the caller's environment alone.
 */
const NODE_TEST_RUNNER_VARS = ['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'];

/**
 * The TOTAL verdict taxonomy, in precedence order. A run's verdict is the
 * highest-precedence verdict any proof or criterion reached.
 */
const VERDICT_ORDER = ['UNSUPPORTED', 'ERROR', 'VACUOUS', 'FAILED', 'UNCONTROLLED', 'FILTERED', 'PROVEN'];

/** @param {string} a @param {string} b @returns {string} the higher-precedence of the two */
function worstVerdict(a, b) {
  return VERDICT_ORDER.indexOf(a) <= VERDICT_ORDER.indexOf(b) ? a : b;
}

/** A verdict-carrying failure. `verdict` is one of VERDICT_ORDER. */
class RedProofError extends Error {
  /** @param {string} verdict @param {string} message */
  constructor(verdict, message) {
    super(message);
    this.name = 'RedProofError';
    this.verdict = verdict;
  }
}

/** @param {string} m @returns {RedProofError} */
const error = (m) => new RedProofError('ERROR', m);
/** @param {string} m @returns {RedProofError} */
const failed = (m) => new RedProofError('FAILED', m);

const REACH = [
  'REACH — what this run does and does not establish:',
  '  ASSERTS  that each SELECTED declared mutation reddens the NAMED assertions, only those,',
  '           and as ASSERTION failures of those tests\' own bodies — each paired with a fresh',
  '           pristine copy running green AFTER the red.',
  '  ASSERTS  that the run was NOT VACUOUS: zero declaration files, zero proofs after',
  '           selection, or zero mutations applied is a RED, never a clean verdict.',
  '  DOES NOT establish that the declared set is COMPLETE — that a criterion carries any proof',
  '           at all, or that a test is non-vacuous in a way nobody declared.',
  '  DOES NOT establish that a declared mutation is SEMANTICALLY RELEVANT — that it changes the',
  '           condition the assertion observes rather than something merely upstream of the same',
  '           failure. The mechanical rules reject the direct self-mutation move (a mutation may',
  '           not target the suite, this runner or a declaration), not every indirect one.',
  '           Completeness and relevance are REVIEW judgments.',
  '  LANE LIMIT: isolation covers only the paths this runner PROVIDES. Each phase\'s working',
  '           directory, TMPDIR/TMP/TEMP, HOME and the four XDG roots live INSIDE that phase\'s own',
  '           copy. PWD names that copy, and the npm-provided cwd-naming variables (INIT_CWD,',
  '           npm_config_local_prefix, npm_package_json) are REMOVED, with PATH stripped of any',
  '           entry inside --root, so no inherited variable still names the checkout. The Wienerdog OVERRIDE_VARS names (WIENERDOG_HOME, WIENERDOG_VAULT,',
  '           WIENERDOG_CLAUDE_DIR, CLAUDE_CONFIG_DIR, CODEX_HOME) are REMOVED from the phase',
  '           environment rather than set, so their roots land inside that copy through the',
  '           redirected HOME they all default under. Each copy is created, manifest-verified and',
  '           locked immediately before its own phase and deleted after it, and while a child runs',
  '           the copies\' parent and the sandbox above it are non-writable and the snapshot is',
  '           read-only — so the running copy is the only writable tree this runner provides.',
  '           The sandbox itself must lie OUTSIDE --root — the snapshot destination may not be a',
  '           descendant of the source — so a TMPDIR under the tree being snapshotted is refused.',
  '           Where mode bits cannot enforce that — win32, or running as uid 0 — the lane REFUSES',
  '           at LOAD with UNSUPPORTED rather than reporting a verdict it cannot stand behind.',
  '           A suite that writes ANYWHERE ELSE (an absolute path this runner does not own, the',
  '           ambient temp root above the sandbox, or a chmod out of the locked parent) is',
  '           UNSUPPORTED BY THE LANE rather than guarded against: full confinement needs OS-level',
  '           sandboxing, which ADR-0004 and portability put out of reach. Same-user boundary, as',
  '           docs/THREAT-MODEL.md draws it.',
].join('\n');

// ── Node floor ───────────────────────────────────────────────────────────────

/**
 * @param {string} [version] e.g. process.versions.node
 * @returns {boolean} true when the running Node can drive this lane
 */
function nodeFloorOk(version) {
  const v = String(version === undefined ? process.versions.node : version);
  const parts = v.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < NODE_FLOOR.length; i++) {
    const got = Number.isFinite(parts[i]) ? parts[i] : 0;
    if (got > NODE_FLOOR[i]) return true;
    if (got < NODE_FLOOR[i]) return false;
  }
  return true;
}

// ── LOAD: inert declarations, validated as data ──────────────────────────────

/**
 * Read every `*.proofs.json` under `<root>/tests/red-proofs` with JSON.parse.
 * NEVER `require`, `import`, `eval` or a `Function` constructor: LOAD precedes
 * SANDBOX, so an executable format would run unconfined.
 *
 * @param {string} root
 * @returns {{proofs:{declFile:string, suite:string, proof:Object}[], digests:Map<string,string>}}
 *          every declared proof in file order, plus the sha256 of the exact bytes
 *          each declaration was parsed from — the tie to the snapshot (Table B row 2)
 */
function loadDeclarations(root) {
  const dir = path.join(root, DECL_DIR_REL);
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.proofs.json')).sort();
  } catch (e) {
    // NOT V1. V1 is reserved for a directory the runner SUCCESSFULLY scanned and
    // found empty. An unreadable, missing or non-directory path means the runner
    // could not obtain a trustworthy result at all, which is Table E2's ERROR —
    // collapsing `EACCES`/`ENOTDIR`/a bad `--root` into "an empty scan" reports
    // a typo'd invocation as a clean vacuity verdict.
    throw error(`the declaration directory could not be scanned: ${dir} (${e.code || e.message}) `
      + '— an unreadable, missing or non-directory path is an ERROR, never V1');
  }
  if (names.length === 0) {
    throw new RedProofError('VACUOUS', `V1: no declaration files — ${dir} holds no *.proofs.json`);
  }

  /** sha256 of the exact bytes each declaration was parsed from. @type {Map<string,string>} */
  const declDigests = new Map();

  /** @type {{declFile:string, suite:string, proof:Object}[]} */
  const out = [];
  const seenIds = new Set();
  for (const name of names) {
    const declFile = path.join(DECL_DIR_REL, name);
    const full = path.join(dir, name);
    // CLASSIFY BEFORE OPENING. `readFileSync` on a FIFO named `*.proofs.json`
    // BLOCKS FOREVER waiting for a writer — before SNAPSHOT exists to classify
    // it — and on a symlink it silently follows the link out of the tree. The
    // same entry-type rule the snapshot domain applies (Table E1) applies here,
    // at the one place that reads a file earlier than the snapshot does.
    let st;
    try {
      st = fs.lstatSync(full);
    } catch (e) {
      throw error(`${declFile}: could not be classified (${e.code || e.message})`);
    }
    if (!st.isFile()) {
      const kind = st.isSymbolicLink() ? 'symbolic link'
        : st.isDirectory() ? 'directory'
          : st.isFIFO() ? 'FIFO'
            : st.isSocket() ? 'socket'
              : st.isBlockDevice() || st.isCharacterDevice() ? 'device' : 'unsupported entry';
      throw error(`${declFile}: unsupported entry type: ${kind} — a declaration must be a regular file, and is never opened before it is classified`);
    }
    let rawBuf;
    let doc;
    try {
      rawBuf = fs.readFileSync(full);
    } catch (e) {
      throw error(`${declFile}: could not be read (${e.code || e.message})`);
    }
    // THE SAME BYTE DISCIPLINE THE MUTATION TARGET GETS, and for the same
    // reason. Decoding with 'utf8' replaces every malformed sequence with
    // U+FFFD, so `JSON.parse` would accept data that is not valid UTF-8 JSON
    // and the digest would be taken over the NORMALISED string — two distinct
    // byte sequences hashing identically, which is exactly the equality the
    // LOAD→SNAPSHOT tie must not accept (Table B row 2). Refuse the lossy
    // decode, then hash the ORIGINAL bytes.
    const raw = rawBuf.toString('utf8');
    if (!Buffer.from(raw, 'utf8').equals(rawBuf)) {
      throw error(`${declFile}: does not round-trip through UTF-8 — a declaration must be valid UTF-8 JSON, or its bytes cannot be tied to the snapshot`);
    }
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      throw error(`${declFile}: not valid JSON — ${e.message}`);
    }
    declDigests.set(declFile, declarationDigest(rawBuf));
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      throw error(`${declFile}: the declaration must be a JSON object`);
    }
    const suite = doc.suite;
    if (typeof suite !== 'string' || suite.length === 0) {
      throw error(`${declFile}: "suite" must be a non-empty string`);
    }
    // Refused as DATA, before any argv is built: a suite path that begins with
    // `-` is indistinguishable from an option to every command line it reaches.
    if (normaliseRel(suite).startsWith('-')) {
      throw error(`${declFile}: "suite" must not begin with "-" (got ${JSON.stringify(suite)}) — a path a command line reads as an option is not a suite`);
    }
    if (!Array.isArray(doc.proofs)) {
      throw error(`${declFile}: "proofs" must be an array`);
    }
    if (doc.proofs.length === 0) {
      throw error(`${declFile}: "proofs" is empty — an empty array is an ERROR, not a clean run over nothing`);
    }
    for (const proof of doc.proofs) {
      validateProof(declFile, suite, proof, seenIds);
      out.push({ declFile, suite, proof });
    }
  }
  return { proofs: out, digests: declDigests };
}

/**
 * The digest a declaration is tied by: sha256 over its EXACT BYTES, never over a
 * decoded string. Two byte sequences can decode to one string — that is what a
 * lossy UTF-8 replacement does — and a tie that cannot tell them apart is not a
 * tie.
 *
 * @param {Buffer} rawBuf @returns {string}
 */
function declarationDigest(rawBuf) {
  return crypto.createHash('sha256').update(rawBuf).digest('hex');
}

/**
 * THE TIE BETWEEN WHAT LOAD PARSED AND WHAT THE SNAPSHOT HOLDS.
 *
 * LOAD reads the declarations; SNAPSHOT is taken afterwards. An edit landing in
 * that window makes the snapshot verify happily against the NEWER bytes while
 * the runner goes on executing the OLDER in-memory proof — a `PROVEN` for a
 * declaration no longer present in the tree the phases actually ran. Row 2's
 * concurrent-edit guarantee is only real if the two are compared.
 *
 * The comparison is over the SET as well as the bytes. A declaration ADDED in the
 * window is copied and manifest-verified like any other file, and a digest-only
 * loop never looks at it — so its proofs are never run while the criterion they
 * belong to rolls up PROVEN on the declarations that were (demonstrated at
 * PR #204 round 3 by both gates). Extra means ERROR, naming the file.
 *
 * @param {string} snapshot @param {Map<string,string>} digests
 * @returns {void}
 */
function assertDeclarationsMatchSnapshot(snapshot, digests) {
  let present;
  try {
    present = fs.readdirSync(path.join(snapshot, DECL_DIR_REL))
      .filter((n) => n.endsWith('.proofs.json')).sort();
  } catch (e) {
    throw error(`the declaration directory is not readable in the snapshot (${e.code || e.message}) — the declaration set changed under the run`);
  }
  for (const name of present) {
    const declFile = path.join(DECL_DIR_REL, name);
    if (!digests.has(declFile)) {
      throw error(`${declFile}: ADDED between LOAD and SNAPSHOT — the snapshotted tree carries a declaration this run never loaded, so its proofs would go unrun while their criterion rolled up as if complete`);
    }
  }
  for (const [declFile, want] of digests) {
    const full = path.join(snapshot, declFile);
    let rawBuf;
    try {
      rawBuf = fs.readFileSync(full);
    } catch (e) {
      throw error(`${declFile}: present at LOAD but not readable in the snapshot (${e.code || e.message}) — the declaration set changed under the run`);
    }
    // Over the RAW BYTES on this side too, or the comparison is between two
    // normalisations rather than between two files.
    const got = declarationDigest(rawBuf);
    if (got !== want) {
      throw error(`${declFile}: changed between LOAD and SNAPSHOT (sha256 ${want.slice(0, 12)} -> ${got.slice(0, 12)}) — the runner would be executing a proof the snapshotted tree no longer holds`);
    }
  }
}

/**
 * Every Table A rule, checked as data. A violation names the declaration file
 * and the proof id, and is an ERROR — never a skip and never a pass.
 *
 * @param {string} declFile @param {string} suite @param {any} proof @param {Set<string>} seenIds
 * @returns {void}
 */
function validateProof(declFile, suite, proof, seenIds) {
  const at = (extra) => `${declFile}: ${extra}`;
  if (proof === null || typeof proof !== 'object' || Array.isArray(proof)) {
    throw error(at('each entry of "proofs" must be an object'));
  }
  const id = proof.id;
  if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw error(at(`"id" must be a non-empty kebab slug (got ${JSON.stringify(id)})`));
  }
  const where = (extra) => `${declFile} [${id}]: ${extra}`;
  if (seenIds.has(id)) throw error(where('duplicate proof id — ids are unique across the declaration directory'));
  seenIds.add(id);

  for (const field of ['wp', 'criterion', 'why', 'file', 'find', 'replace', 'marker']) {
    if (typeof proof[field] !== 'string' || proof[field].length === 0) {
      throw error(where(`"${field}" must be a non-empty string`));
    }
  }
  // Table A says `WP-<slug>`, and `docs/GLOSSARY.md` says a slug is KEBAB-CASE.
  // The looser form accepted `WP-bad-` and `WP-a--b`, which name no canonical work
  // package and would be rolled up as if they did. Checked against every spec id
  // in `docs/specs/` and `docs/specs/done/` (265 of them, all lowercase kebab,
  // digits included — `WP-087-dream-truncation-index-rebase` matches).
  if (!/^WP-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proof.wp)) {
    throw error(where(`"wp" must be a kebab-case WP id — no empty, doubled or trailing segment (got ${JSON.stringify(proof.wp)})`));
  }
  if (proof.replace === proof.find) throw error(where('"replace" must differ from "find"'));
  if (!proof.replace.includes(proof.marker)) throw error(where('"replace" must contain "marker"'));

  if (proof.occurrences !== undefined) {
    if (!Number.isInteger(proof.occurrences) || proof.occurrences < 1) {
      throw error(where(`"occurrences" must be a positive integer (got ${JSON.stringify(proof.occurrences)})`));
    }
  }
  if (proof.testNamePattern !== undefined
    && (typeof proof.testNamePattern !== 'string' || proof.testNamePattern.length === 0)) {
    throw error(where('"testNamePattern", when present, must be a non-empty string'));
  }

  const file = normaliseRel(proof.file);
  if (file === normaliseRel(suite)) {
    throw error(where('"file" must not be the suite it reddens — a mutation may not edit the assertion, its expected literal or its host'));
  }
  if (file === RUNNER_REL) throw error(where('"file" must not be the RED-proof runner itself'));
  if (file === SUITE_ENTRY_REL) {
    throw error(where(`"file" must not be ${SUITE_ENTRY_REL} — the runner spawns it to start every phase`));
  }
  if (file === DECL_DIR_REL || file.startsWith(`${DECL_DIR_REL}/`)) {
    throw error(where('"file" must not be a declaration'));
  }

  if (!Array.isArray(proof.expectRed) || proof.expectRed.length === 0) {
    throw error(where('"expectRed" must be a non-empty array'));
  }
  const seenTests = new Set();
  for (const entry of proof.expectRed) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw error(where('each "expectRed" entry must be an object'));
    }
    if (!Array.isArray(entry.test) || entry.test.length === 0
      || entry.test.some((n) => typeof n !== 'string' || n.length === 0)) {
      throw error(where('"expectRed[].test" must be a non-empty array of non-empty names, outermost first — never a bare name'));
    }
    // A RAW CONTROL CHARACTER CAN NEVER BE OBSERVED, so a declaration carrying
    // one is a permanent "did not RUN" that reads like a renamed test.
    // MEASURED on v25.9.0 and v20.20.2: Node renders a control character in a
    // test name as a JS-STYLE ESCAPE and the TAP layer then doubles its
    // backslash, so `test('nl\na')` is emitted as the SIX bytes `nl\\na` —
    // byte-for-byte what `test('nl\\na')` emits. The two are indistinguishable
    // in the stream, so no decoder can invert them and the runner does not
    // guess: it refuses the declaration and tells the author the spelling the
    // reporter actually uses.
    for (const [i, name] of entry.test.entries()) {
      const ctrl = /[\u0000-\u001f\u007f]/.exec(name);
      if (ctrl) {
        const code = `\\u${ctrl[0].codePointAt(0).toString(16).padStart(4, '0')}`;
        throw error(where(`"expectRed[].test[${i}]" contains a raw control character (${code}) — `
          + 'the TAP reporter renders control characters as escape sequences, so this identity can never be '
          + 'observed. Declare the name the reporter prints (a newline appears as a backslash followed by "n"). '
          + 'NOTE: that spelling is also what a name containing a literal backslash and "n" produces, and the two '
          + 'are indistinguishable in the stream; when both exist in one suite the ambiguity refusal catches it'));
      }
    }
    if (typeof entry.signal !== 'string' || entry.signal.length === 0) {
      throw error(where('"expectRed[].signal" must be a non-empty substring — an empty signal matches every diagnostic'));
    }
    const key = JSON.stringify(entry.test);
    if (seenTests.has(key)) throw error(where(`duplicate "expectRed" identity ${key}`));
    seenTests.add(key);
  }
}

/**
 * `p` with `\` separators folded and the path COLLAPSED — `.` and `..` segments
 * resolved lexically. Collapsing is load-bearing, not tidiness: measured at
 * PR #204 round 1, a `file` of `tests/../tests/suite-basic.js` compared unequal
 * to `tests/suite-basic.js` under a fold-only rule, walked past every protected
 * target check, and let a proof mutate the assertion host itself and report
 * PROVEN. This is the FIRST of two layers; `assertNotProtected` is the
 * authoritative one, over canonical paths inside the fresh copy.
 *
 * @param {string} p @returns {string}
 */
function normaliseRel(p) {
  const folded = String(p).replace(/\\/g, '/');
  const collapsed = path.posix.normalize(folded);
  return collapsed.replace(/^\.\//, '').replace(/\/$/, '') || '.';
}

// ── SNAPSHOT: the manifest over the declared domain ──────────────────────────

/**
 * Every `lstat` entry under `root` except `.git/` and `node_modules/`. A
 * path/size/digest manifest is blind to exactly the differences that change how
 * a suite behaves — measured, two trees compared EQUAL across a 0755→0644 mode
 * change and across a missing empty directory — so mode bits are recorded for
 * files AND directories, and a directory is an entry in its own right.
 *
 * @param {string} root
 * @returns {Map<string, {type:string, mode:number, size?:number, digest?:string}>}
 */
function buildManifest(root) {
  /** @type {Map<string, {type:string, mode:number, size?:number, digest?:string}>} */
  const out = new Map();
  /** @param {string} rel */
  const walk = (rel) => {
    const abs = rel === '' ? root : path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch (e) {
      throw error(`the snapshot domain could not be read at ${rel === '' ? '.' : rel} (${e.code || e.message})`);
    }
    for (const ent of entries) {
      const childRel = rel === '' ? ent.name : `${rel}/${ent.name}`;
      const childAbs = path.join(root, childRel);
      let st;
      try {
        st = fs.lstatSync(childAbs);
      } catch (e) {
        throw error(`the snapshot domain could not be read at ${childRel} (${e.code || e.message})`);
      }
      // ENTRY TYPE IS DECIDED BEFORE ANY EXCLUSION, and the order is the fix for
      // a measured hole: filtering `.git`/`node_modules` by NAME first silently
      // accepted a source tree whose `node_modules` was itself a SYMLINK — a
      // dependency link, which Table B row 2a requires to be an ERROR naming its
      // path, and the run returned PROVEN over it.
      if (st.isSymbolicLink()) {
        throw error(`unsupported entry type: symbolic link at ${childRel} — the copy step refuses symlinks, dependency links included`);
      }
      if (!st.isDirectory() && !st.isFile()) {
        const kind = st.isBlockDevice() || st.isCharacterDevice() ? 'device'
          : st.isSocket() ? 'socket' : st.isFIFO() ? 'FIFO' : 'unsupported entry';
        throw error(`unsupported entry type: ${kind} at ${childRel}`);
      }
      // The exclusion is by BASENAME and applies to a FILE as well as a
      // directory — in a LINKED GIT WORKTREE `.git` is a regular file, and this
      // repository is one. `copyTree`'s filter uses the same rule, so the two
      // agree by construction rather than by call-site ordering.
      if (EXCLUDED_DIRS.has(ent.name)) continue;
      if (st.isDirectory()) {
        out.set(childRel, { type: 'dir', mode: st.mode & 0o7777 });
        walk(childRel);
        continue;
      }
      out.set(childRel, {
        type: 'file',
        mode: st.mode & 0o7777,
        size: st.size,
        digest: crypto.createHash('sha256').update(fs.readFileSync(childAbs)).digest('hex'),
      });
    }
  };
  walk('');
  return out;
}

/**
 * Compare a phase copy to the manifest BEFORE it is used. Any missing entry,
 * extra entry, type difference, mode difference, size difference or digest
 * mismatch is an ERROR.
 *
 * @param {string} dir @param {Map<string, any>} manifest
 * @returns {void}
 */
function verifyCopy(dir, manifest) {
  const got = buildManifest(dir);
  /** @type {string[]} */
  const problems = [];
  for (const [rel, want] of manifest) {
    const have = got.get(rel);
    if (!have) { problems.push(`missing: ${rel}`); continue; }
    if (have.type !== want.type) { problems.push(`type differs: ${rel} (${want.type} -> ${have.type})`); continue; }
    if (have.mode !== want.mode) {
      problems.push(`mode differs: ${rel} (${want.mode.toString(8)} -> ${have.mode.toString(8)})`);
    }
    if (want.type === 'file') {
      if (have.size !== want.size) problems.push(`size differs: ${rel} (${want.size} -> ${have.size})`);
      else if (have.digest !== want.digest) problems.push(`digest differs: ${rel}`);
    }
  }
  for (const rel of got.keys()) if (!manifest.has(rel)) problems.push(`extra: ${rel}`);
  if (problems.length > 0) {
    throw error(`the copy at ${dir} does not match the snapshot manifest:\n  ${problems.join('\n  ')}`);
  }
}

// ── COPY and phase isolation ─────────────────────────────────────────────────

/** @param {string} src @param {string} dest @returns {void} */
function copyTree(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    filter: (from) => !EXCLUDED_DIRS.has(path.basename(from)),
  });
}

/**
 * Hold the snapshot tree read-only (every write bit cleared) while a child runs,
 * and restore its true modes from the manifest before a copy is taken.
 *
 * The snapshot is a path THE RUNNER PROVIDES and it sits above every phase copy,
 * so it is reachable by traversal even with the copies' parent and the sandbox
 * locked. Restoring exact modes before each copy is what keeps the copy
 * manifest-conformant, so the mode column stays a real check rather than one the
 * runner has arranged to pass.
 *
 * @param {string} snapshot @param {Map<string, any>} manifest @param {boolean} writable
 * @returns {void}
 */
function setSnapshotWritable(snapshot, manifest, writable) {
  for (const [rel, entry] of manifest) {
    try {
      fs.chmodSync(path.join(snapshot, rel), writable ? entry.mode : (entry.mode & ~0o222));
    } catch { /* best effort: a mode we cannot set is caught by verifyCopy */ }
  }
  try { fs.chmodSync(snapshot, writable ? 0o700 : 0o500); } catch { /* best effort */ }
}

/**
 * Create the per-phase scratch INSIDE the copy, after it is manifest-verified.
 * @param {string} copyDir @returns {void}
 */
function preparePhaseDirs(copyDir) {
  fs.mkdirSync(path.join(copyDir, PHASE_TMP), { recursive: true });
  fs.mkdirSync(path.join(copyDir, PHASE_HOME), { recursive: true });
  for (const name of ['config', 'cache', 'data', 'state']) {
    fs.mkdirSync(path.join(copyDir, PHASE_XDG, name), { recursive: true });
  }
}

/**
 * THE PROVIDED SET, redirected per phase into that phase's own copy. Anything a
 * suite writes to outside this set is UNSUPPORTED BY THE LANE (see REACH).
 *
 * @param {string} copyDir @param {string} [root] the source tree, for PATH sanitising
 * @returns {NodeJS.ProcessEnv}
 */
function phaseEnv(copyDir, root) {
  const env = { ...process.env };
  const tmp = path.join(copyDir, PHASE_TMP);
  env.TMPDIR = tmp;
  env.TMP = tmp;
  env.TEMP = tmp;
  env.HOME = path.join(copyDir, PHASE_HOME);
  env.XDG_CONFIG_HOME = path.join(copyDir, PHASE_XDG, 'config');
  env.XDG_CACHE_HOME = path.join(copyDir, PHASE_XDG, 'cache');
  env.XDG_DATA_HOME = path.join(copyDir, PHASE_XDG, 'data');
  env.XDG_STATE_HOME = path.join(copyDir, PHASE_XDG, 'state');
  // `PWD` IS PART OF THE WORKING DIRECTORY, and spawning does not update it.
  // Row 2b's provided set names "the working directory"; `cwd: copyDir` moves
  // the process but leaves the INHERITED `PWD` pointing at the real checkout, so
  // a suite reading `process.env.PWD` — which a shell-shaped script naturally
  // does — sees the same path in BASELINE, RED and CONTROL: shared state, and a
  // write path straight into the source tree. `OLDPWD` is the same variable one
  // step back, so it is removed rather than left pointing somewhere real.
  env.PWD = copyDir;
  delete env.OLDPWD;
  for (const name of NPM_CWD_VARS) delete env[name];
  // PATH IS SANITISED, NOT REMOVED. `npm run` puts `<root>/node_modules/.bin`
  // on it, which is a path INTO THE SOURCE TREE — and the phase copy carries no
  // `node_modules` at all, so such an entry can only ever resolve outside the
  // sandbox. Every other entry is a system path a suite legitimately needs
  // (`git`, `sh`), so they stay.
  if (root && typeof env.PATH === 'string') {
    // COMPARED ON REALPATHS, both sides. `--root` is resolved once at LOAD while
    // npm writes the PATH entry with the path as given — on macOS that is
    // `/var/...` against `/private/var/...`, and a raw string compare lets the
    // entry through. The entry need not exist, so resolution is best-effort.
    const inside = (e) => {
      for (const c of [e, realpathish(e)]) if (c === root || c.startsWith(root + path.sep)) return true;
      return false;
    };
    env.PATH = env.PATH.split(path.delimiter).filter((e) => e && !inside(e)).join(path.delimiter);
  }
  for (const name of REDIRECTED_ENV_VARS) delete env[name];
  for (const name of NODE_TEST_RUNNER_VARS) delete env[name];
  return env;
}

/**
 * Start the suite through the SANDBOX's own `tests/run.js`, never `node --test`
 * directly, so `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` applies to every child and
 * this WP adds no second place that sets it.
 *
 * @param {string} copyDir @param {string} suiteRel @param {string|undefined} pattern
 * @param {string} [root] the source tree, forwarded to `phaseEnv` for PATH sanitising
 * @returns {{status:number|null, signal:string|null, spawnError:Error|null, stdout:string, stderr:string}}
 */
function runSuite(copyDir, suiteRel, pattern, root) {
  const runner = path.join(copyDir, 'tests', 'run.js');
  if (!fs.existsSync(runner)) {
    throw error(`the root provides no tests/run.js — expected ${path.join('tests', 'run.js')} inside the copy at ${copyDir}`);
  }
  // REFUSED HERE TOO, not only at LOAD, and the reason is measured. `node --test`
  // reads a `-`-leading path as an OPTION and falls back to DEFAULT DISCOVERY,
  // running files nobody declared (measured: `1..0`, exit 0, in a tree with no
  // discoverable tests — and OTHER SUITES in a tree that has them, whose
  // assertion hosts are not protected mutation targets). Adding `--` does NOT
  // rescue that path: measured on v25.9.0, `node --test -- <dash-path>` HANGS,
  // waiting for a script on stdin, which is the one failure a runner cannot
  // report. So the path is refused at both layers and the hang is unreachable.
  if (normaliseRel(suiteRel).startsWith('-')) {
    throw error(`the suite path ${JSON.stringify(suiteRel)} begins with "-" — a command line reads it as an option, never as a file`);
  }
  const args = [runner, '--test-reporter=tap'];
  if (pattern) args.push(`--test-name-pattern=${pattern}`);
  // `--` FIRST, THEN THE PATH. A repo-relative filename may legally begin with
  // `-` — `--test-name-pattern=target` is a valid file name — and Node would
  // read it as ANOTHER OPTION, run its DEFAULT DISCOVERY over other test files,
  // and hand the runner a suite it never declared. Only the declared suite is a
  // protected mutation target, so a proof could then redden (and mutate) the
  // assertion host of a file nobody named. THE REFUSALS ARE THE MECHANISM and
  // `--` is the belt, not the other way round: measured, `node --test --
  // <dash-path>` does not run that file either — Node waits for a script on
  // stdin and HANGS. So the path is refused as data at LOAD and again at the top
  // of this function, and the terminator stays because it is measured harmless
  // for legal paths and ends option parsing for one that is legal today but
  // option-shaped under some future Node.
  args.push('--', suiteRel);
  const r = spawnSync(process.execPath, args, {
    cwd: copyDir,
    env: phaseEnv(copyDir, root),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: r.status,
    signal: r.signal || null,
    spawnError: r.error || null,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/**
 * THE CHILD MUST HAVE COMPLETED BEFORE ITS TAP MEANS ANYTHING.
 *
 * A killed child, a spawn failure or a stream cut short by `maxBuffer` can leave
 * stdout holding a PREFIX of the run — one that may already carry every declared
 * `not ok` while the rest of the failing set was never emitted. Judging the
 * equality rule on a fragment would let a proof reach PROVEN over a run nobody
 * observed the end of, so the phases refuse the fragment instead: no status, a
 * terminating signal, a status the reporter never produces, a missing plan, or a
 * plan the emitted result lines do not fill, are each an ERROR.
 *
 * @param {{status:number|null, signal:string|null, spawnError:Error|null, stdout:string}} run
 * @param {string} where @param {string} phase
 * @returns {void}
 */
function assertCompleteRun(run, where, phase) {
  if (run.spawnError) {
    throw error(`${where} ${phase}: the suite process could not be run (${run.spawnError.code || run.spawnError.message})`);
  }
  if (run.signal) {
    throw error(`${where} ${phase}: the suite process was KILLED by ${run.signal} — its TAP is partial, and a partial failing set is not a measurement`);
  }
  if (run.status === null) {
    throw error(`${where} ${phase}: the suite process did not exit normally — no exit status, so its TAP cannot be trusted to be complete`);
  }
  if (run.status !== 0 && run.status !== 1) {
    throw error(`${where} ${phase}: the suite process exited ${run.status}; the TAP reporter exits 0 (all green) or 1 (failures), so any other status means the run was cut short`);
  }
  // AND THE SAME RULE ONE LEVEL IN. `tests/run.js` and `node --test` normalise a
  // test file's own exit code to the reporter's 0/1, so a child that called
  // `process.exit(3)` mid-stream arrives as a plain outer status 1. The reporter
  // still records what the FILE did, as `exitCode:` on its file-level record —
  // measured: 3 for a child torn down mid-run, 1 for a file that merely failed
  // (a module that would not parse). Only a file-level diagnostic sits at two
  // spaces of indentation, so this reads file records and never a nested test's.
  const fileExit = [...run.stdout.matchAll(/^ {2}exitCode: (\d+)$/gm)].map((m) => Number(m[1]));
  const cutShort = fileExit.find((n) => n !== 0 && n !== 1);
  if (cutShort !== undefined) {
    throw error(`${where} ${phase}: a test file exited ${cutShort}; the reporter's own codes are 0 and 1, so the file was torn down mid-run and its TAP is a prefix`);
  }
  const lines = tapLines(run.stdout);
  const plans = lines.filter((l) => /^1\.\.\d+$/.test(l));
  if (plans.length === 0 || !/^# tests \d+$/m.test(run.stdout)) {
    throw error(`${where} ${phase}: the TAP stream is INCOMPLETE — no top-level plan and summary were emitted, so the observed set is a prefix of the run`);
  }
  const planned = Number(plans[plans.length - 1].slice('1..'.length));
  const emitted = lines.filter((l) => /^(not ok|ok)(\s|$)/.test(l)).length;
  if (emitted !== planned) {
    throw error(`${where} ${phase}: the TAP plan announces ${planned} top-level result(s) but ${emitted} were emitted — the stream is truncated`);
  }
}

// ── TAP: identity, terminal status and failure KIND ──────────────────────────

/**
 * @typedef {Object} TapNode
 * @property {string} name
 * @property {boolean} ok
 * @property {string|null} directive  'SKIP' | 'TODO' | null
 * @property {Object} diag            top-level diagnostic keys plus `raw`
 * @property {TapNode[]} children
 */

/**
 * A TAP test name, exactly as the reporter wrote it.
 *
 * ONLY THE LINE TERMINATOR IS STRIPPED, never the name's own whitespace. A test
 * name may legally end in a space — `test('case ', …)` — and MEASURED on
 * v25.9.0 and v20.20.2 the reporter preserves it verbatim (`ok 1 - case `), as
 * it preserves leading spaces. A `trimEnd()` here changed the OBSERVED identity:
 * a declaration naming `['case ']` failed BASELINE as "did not RUN", and
 * `'case '` and `'case'` collapsed onto one identity and became spuriously
 * ambiguous. Table A accepts any non-empty name and compares identities exactly,
 * so the two sides must be byte-for-byte — and the declaration side never
 * normalised, which is what made this one-sided.
 *
 * @param {string} s @returns {string}
 */
function unescapeTapName(s) {
  return s.replace(/\\([\\#])/g, '$1');
}

/**
 * Split a reporter stream into lines with the terminator removed — BOTH of it.
 * JavaScript's `.` excludes `\r` (it is a line terminator), so a CRLF stream made
 * every result-line match fail and the whole stream parsed to ZERO nodes;
 * `trimEnd()` never reached it. Stripping the terminator once, here, is what
 * makes the name-preserving rule above mean anything on such a stream.
 *
 * @param {string} text @returns {string[]}
 */
function tapLines(text) {
  return text.split('\n').map((l) => l.replace(/\r$/, ''));
}

/**
 * Parse Node's TAP reporter output into a tree. Node documents reporter output
 * as unstable for programmatic use, which is why an expected field that the
 * running Node does not emit is a LOUD ERROR downstream rather than an
 * assumption that a failure was an assertion.
 *
 * @param {string} text @param {string} [suiteArg] the suite path as passed to node
 * @returns {TapNode[]} root nodes, with a file-level wrapper (if any) removed
 */
function parseTap(text, suiteArg) {
  const lines = tapLines(text);
  /** @type {Map<number, TapNode[]>} */
  const byDepth = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^( *)(not ok|ok)(?: +\d+)?(?: - (.*))?$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    if (indent % 4 !== 0) continue;
    const depth = indent / 4;

    let rest = m[3] === undefined ? '' : m[3];
    /** @type {string|null} */
    let directive = null;
    // EXACTLY ONE SEPARATOR SPACE, not a run of them. MEASURED on both Nodes: a
    // skipped `test('skipped ', …)` prints `ok 1 - skipped  # SKIP why` — the
    // name's own trailing space, then the single space TAP puts before the
    // directive. A `\s+#` would eat both and corrupt the identity. A `#` inside
    // a name is escaped (`plain\#hash`), so an unescaped ` #` is unambiguous.
    const dm = / #\s+(SKIP|TODO)\b.*$/i.exec(rest);
    if (dm) {
      directive = dm[1].toUpperCase();
      rest = rest.slice(0, dm.index);
    }

    const base = indent + 2;
    const pad = ' '.repeat(base);
    /** @type {string[]} */
    const diagLines = [];
    if (lines[i + 1] === `${pad}---`) {
      let j = i + 2;
      for (; j < lines.length && lines[j] !== `${pad}...`; j++) diagLines.push(lines[j]);
      i = j;
    }

    /** @type {TapNode} */
    const node = {
      name: unescapeTapName(rest),
      ok: m[2] === 'ok',
      directive,
      diag: parseDiag(diagLines, base),
      children: byDepth.get(depth + 1) || [],
    };
    byDepth.delete(depth + 1);
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(node);
  }

  let roots = byDepth.get(0) || [];
  // A file-level wrapper is not part of any test's identity. Node emits one when
  // a run matched no test at all on Node >= 25 (an inner `1..0` under an outer
  // file-level `ok`, exit 0), and on any Node when the file itself fails. ITS
  // NAME IS NOT THE SAME STRING ON EVERY NODE — measured: Node v25.9.0 names it
  // exactly as the path was passed, Node v20.20.2 names it with the ABSOLUTE
  // path — so the name match is over the relative form, the basename and any
  // path-suffix of it, never one version's spelling.
  //
  // BUT A NAME MATCH IS NOT ENOUGH, and that was a false-PROVEN hole (PR #204
  // round 3). `test('suite-basic.js', …)` is a perfectly legal top-level test;
  // dropping it because it is spelled like the suite removed it from the identity
  // set, so an UNDECLARED OWN-BODY FAILURE inside it vanished from RED's equality
  // rule and the proof reported PROVEN. A wrapper is therefore recognised by
  // REPORTER STRUCTURE as well as by name:
  //   (a) it HAS CHILDREN — the file's tests are nested under it; or
  //   (b) the child stream announced an INNER PLAN OF ZERO (a `1..0` that is not
  //       the final plan), which is the no-match shape exactly: the file ran no
  //       test, and the parent synthesised one record to stand for the file.
  // A CHILDLESS root with neither is a TEST, and it stays.
  //
  // EVERY MEASURED WRAPPER IS CHILDLESS, AND THAT IS THE WHOLE RULE. Measured on
  // v25.9.0 and v20.20.2, through `tests/run.js` -> `node --test <file>`, with
  // and without `--experimental-test-isolation=process`:
  //   * a file whose tests RUN emits NO wrapper at all — every test, a namesake
  //     parent WITH SUBTESTS included, is a root in its own right;
  //   * an unmatched `--test-name-pattern` (Node >= 25) emits an inner `1..0`
  //     and then a CHILDLESS record named for the file;
  //   * a file that registers nothing, and a file that fails at file level,
  //     each emit a CHILDLESS record named for the file.
  // No measured wrapper has ever carried children. The round-3 rule treated
  // "matches by name AND has children" as sufficient, and that was a GUESS: a
  // legal `test('tests/suite-x.js', async (t) => { … })` with subtests was
  // replaced by those subtests, so its OWN-BODY failure vanished from RED's
  // equality set and the proof reported PROVEN (PR #204 round 6, found by two
  // channels independently). A wrapper is therefore recognised as the SOLE root,
  // CHILDLESS, with positive evidence it is the reporter's record.
  //
  // ONE SHAPE STAYS AMBIGUOUS, AND THIS FUNCTION DOES NOT DECIDE IT. A file that
  // registers no test emits a childless record with NO inner zero plan —
  // byte-for-byte what a real childless namesake test emits — so `parseTap`
  // keeps it and `assertNotAmbiguousSuiteShape` REFUSES the run.
  //
  // READ THAT FUNCTION BEFORE CHANGING ANYTHING HERE. Rounds 3–9 justified
  // keeping the node on the reasoning that keeping "only ADDS an identity, which
  // can only make the rules stricter". THAT REASONING IS RETRACTED and the
  // comment stating it is gone: it fails exactly when the added identity is one
  // somebody DECLARED, because BASELINE then reads the empty-file record as that
  // identity having RUN and PASSED. Measured at PR #204 round 10 (found
  // independently by the hermetic shadow and the Codex plugin): a suite that
  // registers `test('tests/suite-conditional.js', …)` only once the mutation
  // lands gives zero real tests in BASELINE and CONTROL, and the runner reported
  // PROVEN, exit 0. Keeping the node here is therefore only safe BECAUSE the
  // phases refuse the shape; deleting that refusal on the strength of this
  // paragraph would restore the false PROVEN.
  if (suiteArg) {
    const rel = normaliseRel(suiteArg);
    const base = path.basename(suiteArg);
    const plans = lines.filter((l) => /^1\.\.\d+$/.test(l));
    const innerZeroPlan = plans.slice(0, -1).includes('1..0');
    const matchesName = (n) => {
      const name = normaliseRel(n.name);
      return name === rel || name === base || name.endsWith(`/${rel}`);
    };
    const isFileNode = (n) => roots.length === 1
      && matchesName(n)
      && n.children.length === 0
      && innerZeroPlan;
    roots = roots.flatMap((n) => (isFileNode(n) ? n.children : [n]));
  }
  return roots;
}

/**
 * Top-level keys of a TAP YAML diagnostic block, plus the block's raw text (the
 * text a `signal` is searched in). Deeper-indented lines belong to a block
 * scalar or a nested mapping and are never read as keys.
 *
 * @param {string[]} diagLines @param {number} base
 * @returns {Object}
 */
function parseDiag(diagLines, base) {
  /** @type {Object} */
  const out = { raw: diagLines.join('\n') };
  const pad = ' '.repeat(base);
  for (const line of diagLines) {
    if (!line.startsWith(pad)) continue;
    const rest = line.slice(base);
    if (/^\s/.test(rest)) continue;
    const km = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(rest);
    if (!km) continue;
    if (out[km[1]] !== undefined) continue;
    let v = km[2];
    if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'");
    else if (/^".*"$/.test(v)) v = v.slice(1, -1);
    out[km[1]] = v;
  }
  return out;
}

/**
 * THE ONE SHAPE THE PARSER CANNOT DECIDE — refused in every phase, not guessed.
 *
 * A file that registers NO tests emits a sole childless record named for the
 * suite, with no inner zero plan. So does a file whose only test is a childless
 * test named like the suite. Round 3 broke that tie by KEEPING the node, on the
 * reasoning that keeping can only ADD an identity and so only make the rules
 * stricter. THAT REASONING HAD A HOLE, and the hermetic shadow found it: if the
 * kept node's name IS a declared identity, BASELINE reads it as that identity
 * having RUN and PASSED. Measured — a suite that registers
 * `test('tests/suite-conditional.js', …)` only once the mutation lands gives
 * zero real tests in BASELINE and CONTROL and a real red in RED, and the runner
 * reported PROVEN, exit 0, over two pristine phases in which nothing ran at all.
 *
 * Refusing costs no legitimate proof: a file that registers nothing can never
 * satisfy BASELINE, and a suite whose only test is a childless namesake is
 * indistinguishable from it — the author renames the test or adds a second, and
 * the ambiguity is gone. This is round 9's rule applied one layer up: where the
 * reporter's output cannot be inverted, refuse rather than pick.
 *
 * @param {string} stdout @param {string} suiteRel @param {string} where @param {string} phase
 * @returns {void}
 */
function assertNotAmbiguousSuiteShape(stdout, suiteRel, where, phase) {
  const plans = tapLines(stdout).filter((l) => /^1\.\.\d+$/.test(l));
  // An inner zero plan is POSITIVE evidence of the reporter's own record, so the
  // shape is decided and `parseTap` unwraps it. Nothing to refuse.
  if (plans.slice(0, -1).includes('1..0')) return;
  const roots = parseTap(stdout);
  if (roots.length !== 1 || roots[0].children.length > 0) return;
  // ONLY A PASSING RECORD IS AMBIGUOUS. A file that registers nothing reports
  // `ok`; so does a childless namesake test that passed — those two are the tie.
  // A `not ok` record is a file-level failure or a failing namesake test, and
  // NEITHER can be read as a terminal PASS, so no false PROVEN is reachable
  // through it: BASELINE refuses it as not green, and RED's own rules classify
  // it. Refusing it here would instead break criterion 4's load-failure outcome,
  // which must stay FAILED.
  if (!roots[0].ok || roots[0].directive) return;
  const rel = normaliseRel(suiteRel);
  const name = normaliseRel(roots[0].name);
  if (!(name === rel || name === path.basename(suiteRel) || name.endsWith(`/${rel}`))) return;
  throw error(`${where} ${phase}: the stream is a SOLE CHILDLESS record named for the suite with no zero-plan — `
    + 'a suite that registers no tests is indistinguishable from a single test named like the suite, so the runner '
    + 'refuses rather than counting it as a terminal PASS. Rename that test, or add a second, so the shape is decidable');
}

/**
 * @param {TapNode[]} roots @param {string[]} [prefix] @param {{node:TapNode, path:string[]}[]} [out]
 * @returns {{node:TapNode, path:string[]}[]}
 */
function flattenTap(roots, prefix = [], out = []) {
  for (const node of roots) {
    const here = [...prefix, node.name];
    out.push({ node, path: here });
    flattenTap(node.children, here, out);
  }
  return out;
}

/**
 * The records that actually RAN. A SKIP directive means the test did not run, and
 * that is the whole of the unmatched-pattern class: measured on Node v20.20.2
 * (this repository's CI), a `--test-name-pattern` matching nothing reports EVERY
 * test as `ok N - <name> # SKIP test name does not match pattern` rather than the
 * inner `1..0` plan Node v25.9.0 emits. Both shapes exit 0 and neither emits a
 * `not ok`, so "the run was green" passes under both. The runner implements the
 * RULE — zero tests ran — never either shape.
 *
 * @param {{node:TapNode, path:string[]}[]} nodes
 * @returns {{node:TapNode, path:string[]}[]}
 */
function ranNodes(nodes) {
  return nodes.filter((n) => n.node.directive !== 'SKIP');
}

/** @param {{node:TapNode}} entry @returns {boolean} a `not ok` that is not a TODO */
function isFailure(entry) {
  return !entry.node.ok && entry.node.directive !== 'TODO';
}

/** @param {string[]} a @param {string[]} b @returns {boolean} */
function samePath(a, b) {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

// ── APPLY ────────────────────────────────────────────────────────────────────

/**
 * Resolve `rel` inside `dir` and refuse anything that canonicalises outside it —
 * `..`, an absolute path and a symlink escape alike. The check is on the
 * RESOLVED path, never on the literal: a start-anchored or literal-only check
 * accepts `a/../../x`.
 *
 * @param {string} dir @param {string} rel @param {string} label
 * @returns {string} the resolved absolute path
 */
function resolveInside(dir, rel, label) {
  const base = fs.realpathSync(dir);
  const target = path.resolve(dir, rel);
  let real;
  try {
    real = fs.realpathSync(target);
  } catch (e) {
    throw error(`${label}: ${JSON.stringify(rel)} does not resolve to an existing path inside ${dir} (${e.code || e.message})`);
  }
  if (real !== base && !real.startsWith(base + path.sep)) {
    throw error(`${label}: ${JSON.stringify(rel)} canonicalises OUTSIDE the copy (${real}) — refused before any write`);
  }
  return real;
}

/**
 * THE AUTHORITATIVE PROTECTED-TARGET CHECK — over the CANONICAL path inside the
 * fresh copy, never over the declaration's literal.
 *
 * Table A's `file` row forbids the suite, the runner, a declaration and any path
 * the runner needs to operate. Comparing repo-relative STRINGS is not enough:
 * measured at PR #204 round 1, `tests/../tests/suite-basic.js` compared unequal
 * to the suite, passed every literal check, and a proof mutated its own assertion
 * host to PROVEN. The comparison therefore happens after `realpathSync`, on both
 * sides, inside the copy the mutation will be written to.
 *
 * @param {string} copyDir @param {string} target the resolved absolute mutation target
 * @param {string} suiteRel @param {string} where
 * @returns {void}
 */
function assertNotProtected(copyDir, target, suiteRel, where) {
  const declDir = realOrNull(path.join(copyDir, DECL_DIR_REL));
  if (declDir && (target === declDir || target.startsWith(declDir + path.sep))) {
    throw error(`${where}: "file" resolves to a declaration (${target}) — a proof may not mutate the declaration set`);
  }
  const protectedRels = [
    [normaliseRel(suiteRel), 'the suite it reddens — a mutation may not edit the assertion, its expected literal, its message or the file that hosts it'],
    [SUITE_ENTRY_REL, 'the test entry the runner spawns to start every phase'],
    [RUNNER_REL, 'the RED-proof runner itself'],
  ];
  for (const [rel, why] of protectedRels) {
    const real = realOrNull(path.join(copyDir, rel));
    if (real !== null && real === target) {
      throw error(`${where}: "file" resolves to ${rel} — ${why}`);
    }
  }
}

/**
 * The canonical form of a path that NEED NOT EXIST: the nearest existing
 * ancestor is resolved and the remainder re-appended. A plain `realpathSync`
 * throws on a missing leaf and a plain `path.resolve` leaves a symlinked
 * ancestor unresolved — and on macOS that is the difference between `/var/...`
 * and `/private/var/...`, which is exactly how a PATH entry inside the source
 * tree survived a containment filter.
 *
 * @param {string} p @returns {string}
 */
function realpathish(p) {
  let cur = path.resolve(p);
  const rest = [];
  for (let i = 0; i < 64; i += 1) {
    try {
      return rest.length === 0 ? fs.realpathSync(cur) : path.join(fs.realpathSync(cur), ...rest);
    } catch {
      const up = path.dirname(cur);
      if (up === cur) return path.resolve(p);
      rest.unshift(path.basename(cur));
      cur = up;
    }
  }
  return path.resolve(p);
}

/** @param {string} p @returns {string|null} the canonical path, or null if it does not exist */
function realOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Count left-to-right, non-overlapping occurrences of `find` in `text`.
 * `aa` occurs ONCE in `aaa` under this rule, and that one rule decides both the
 * count and the replacement — never whichever the implementation happened to
 * pick.
 *
 * @param {string} text @param {string} find
 * @returns {number}
 */
function countOccurrences(text, find) {
  let n = 0;
  let at = 0;
  for (;;) {
    const hit = text.indexOf(find, at);
    if (hit === -1) return n;
    n += 1;
    at = hit + find.length;
  }
}

/**
 * @param {string} text @param {string} find @param {string} replace
 * @returns {string} every left-to-right non-overlapping occurrence replaced
 */
function replaceOccurrences(text, find, replace) {
  let out = '';
  let at = 0;
  for (;;) {
    const hit = text.indexOf(find, at);
    if (hit === -1) return out + text.slice(at);
    out += text.slice(at, hit) + replace;
    at = hit + find.length;
  }
}

/**
 * Prove the mutation LANDED — the measured shell-escaping class is a mutation
 * that was never applied and read as a green. The postcondition is written
 * bytes EQUAL to the expected post-mutation bytes, not "the digest changed",
 * which a partial or overlapping replacement also satisfies.
 *
 * @param {string} copyDir @param {Object} proof @param {string} where
 * @param {string} [suiteRel] the declaration's suite, protected against aliases
 * @returns {{path:string, occurrences:number}}
 */
function applyMutation(copyDir, proof, where, suiteRel) {
  const target = resolveInside(copyDir, proof.file, where);
  if (suiteRel !== undefined) assertNotProtected(copyDir, target, suiteRel, where);
  // BYTE EQUALITY IS THE POSTCONDITION, so the decode may not lose a byte.
  // Reading with 'utf8' replaces every malformed sequence with U+FFFD, and the
  // string write re-encodes the replacement: bytes OUTSIDE the matched substring
  // change, while `written === expected` still holds because both sides carry
  // the same corruption. Table B row 4 wants the written bytes to equal the
  // expected post-mutation bytes of the PRISTINE file, so a target that does not
  // survive a decode/encode round-trip is refused rather than quietly rewritten.
  const pristineBuf = fs.readFileSync(target);
  const pristine = pristineBuf.toString('utf8');
  if (!Buffer.from(pristine, 'utf8').equals(pristineBuf)) {
    throw error(`${where}: ${proof.file} does not round-trip through UTF-8 — it holds bytes a text mutation would silently rewrite outside the match. Table B row 4's byte equality cannot be established here`);
  }
  const wanted = proof.occurrences === undefined ? 1 : proof.occurrences;
  const counted = countOccurrences(pristine, proof.find);
  if (counted !== wanted) {
    throw error(`${where}: "find" occurs ${counted} time(s) in ${proof.file}, "occurrences" declares ${wanted}`);
  }
  if (pristine.includes(proof.marker)) {
    throw error(`${where}: "marker" ${JSON.stringify(proof.marker)} is ALREADY present in the pristine ${proof.file} — a marker already there proves nothing`);
  }
  const expected = replaceOccurrences(pristine, proof.find, proof.replace);
  const expectedBuf = Buffer.from(expected, 'utf8');
  fs.writeFileSync(target, expectedBuf);
  // Compared as BYTES, not as decoded text: two different byte strings can
  // decode to one string, which is exactly the equality this row must not accept.
  const writtenBuf = fs.readFileSync(target);
  if (!writtenBuf.equals(expectedBuf)) {
    throw error(`${where}: the bytes written to ${proof.file} do not equal the expected post-mutation bytes`);
  }
  const written = writtenBuf.toString('utf8');
  if (!written.includes(proof.marker)) {
    throw error(`${where}: "marker" ${JSON.stringify(proof.marker)} is absent after the write`);
  }
  return { path: target, occurrences: counted };
}

// ── The phases, per proof ────────────────────────────────────────────────────

/**
 * @param {{node:TapNode, path:string[]}[]} nodes @param {string[]} identity @param {string} where
 * @returns {{node:TapNode, path:string[]}|null}
 */
function uniqueMatch(nodes, identity, where) {
  const hits = nodes.filter((n) => samePath(n.path, identity));
  if (hits.length > 1) {
    throw error(`${where}: the declared identity ${JSON.stringify(identity)} matches ${hits.length} observed tests — ambiguous; the runner refuses rather than picking one`);
  }
  return hits[0] || null;
}

/**
 * BASELINE: a pristine copy runs green and each declared identity is observed
 * exactly once as a terminal PASS. An unmatched `--test-name-pattern` prints an
 * inner `1..0` under an outer file-level `ok` and exits 0 — measured — so "the
 * run was green" is never on its own the check.
 *
 * @param {string} copyDir @param {Object} decl @param {Object} proof @param {string} where
 * @returns {void}
 */
function phaseBaseline(copyDir, decl, proof, where, root) {
  const suiteTarget = resolveInside(copyDir, decl.suite, `${where} BASELINE`);
  // A REGULAR FILE, checked with `lstat` in the copy: a directory or a device
  // named as the suite would send Node back to default discovery or block.
  const st = fs.lstatSync(suiteTarget);
  if (!st.isFile()) {
    throw error(`${where} BASELINE: "suite" ${JSON.stringify(decl.suite)} is not a regular file in the copy`);
  }
  const run = runSuite(copyDir, normaliseRel(decl.suite), proof.testNamePattern, root);
  assertCompleteRun(run, where, 'BASELINE');
  assertNotAmbiguousSuiteShape(run.stdout, normaliseRel(decl.suite), where, 'BASELINE');
  if (run.status !== 0) {
    throw error(`${where} BASELINE: the pristine suite was not green (exit ${run.status})\n${tail(run.stdout, run.stderr)}`);
  }
  evaluateBaseline(flattenTap(parseTap(run.stdout, normaliseRel(decl.suite))), proof, where);
}

/**
 * ZERO TESTS RAN is an ERROR in every phase, under BOTH pinned reporter shapes
 * for the unmatched-pattern class (see `ranNodes`). Stated once, here, so the
 * two phases enforce one rule rather than two readings of one Node's output.
 *
 * @param {{node:TapNode, path:string[]}[]} nodes @param {Object} proof @param {string} where
 * @param {boolean} [requireAny] true where an EMPTY observation is itself the failure
 * @returns {void}
 */
function assertTestsRan(nodes, proof, where, requireAny) {
  if (ranNodes(nodes).length > 0) return;
  // A tree of records that ALL carry a SKIP directive is the unmatched-pattern
  // class itself, and it is an ERROR in every phase. NO records at all is a
  // different thing — a module that failed to load emits none — and only
  // BASELINE treats that as its own ERROR, so criterion 4's load-failure
  // mutation keeps reaching RED's equality rule and its FAILED verdict.
  if (nodes.length === 0 && !requireAny) return;
  const scoped = proof.testNamePattern
    ? ` — the testNamePattern ${JSON.stringify(proof.testNamePattern)} selected nothing`
    : '';
  throw error(`${where}: ZERO TESTS RAN${scoped}. Every observed record either does not exist or carries a SKIP `
    + 'directive, which is the unmatched-pattern class under both of its pinned reporter shapes '
    + '(an inner `1..0` plan on Node >= 25; every test `ok N - <name> # SKIP` on Node 20.x). '
    + 'Both exit 0 and neither emits a `not ok`, so a naive "the run was green" check passes there.');
}

/**
 * BASELINE's identity rules, over the observed nodes alone.
 * @param {{node:TapNode, path:string[]}[]} nodes @param {Object} proof @param {string} where
 * @returns {void}
 */
function evaluateBaseline(nodes, proof, where) {
  assertTestsRan(nodes, proof, `${where} BASELINE`, true);
  for (const entry of proof.expectRed) {
    const hit = uniqueMatch(nodes, entry.test, `${where} BASELINE`);
    if (!hit) {
      throw error(`${where} BASELINE: the declared identity ${JSON.stringify(entry.test)} did not RUN — renamed, deleted, or excluded by testNamePattern`);
    }
    if (hit.node.directive) {
      throw error(`${where} BASELINE: the declared identity ${JSON.stringify(entry.test)} was observed as ${hit.node.directive}, not as a terminal PASS`);
    }
    if (!hit.node.ok) {
      throw error(`${where} BASELINE: the declared identity ${JSON.stringify(entry.test)} did not PASS in the pristine copy`);
    }
  }
}

/**
 * RED: the observed OWN-BODY failing identity set EQUALS the declared set, each
 * declared failure is a test-code ASSERTION failure of that test's own body, and
 * each diagnostic carries its `signal`.
 *
 * @param {string} copyDir @param {Object} decl @param {Object} proof @param {string} where
 * @returns {{failures:number}}
 */
function phaseRed(copyDir, decl, proof, where, root) {
  const run = runSuite(copyDir, normaliseRel(decl.suite), proof.testNamePattern, root);
  assertCompleteRun(run, where, 'RED');
  assertNotAmbiguousSuiteShape(run.stdout, normaliseRel(decl.suite), where, 'RED');
  return evaluateRed(flattenTap(parseTap(run.stdout, normaliseRel(decl.suite))), proof, where);
}

/**
 * RED's equality, failure-kind and signal rules, over the observed nodes alone.
 * @param {{node:TapNode, path:string[]}[]} nodes @param {Object} proof @param {string} where
 * @returns {{failures:number}}
 */
function evaluateRed(nodes, proof, where) {
  assertTestsRan(nodes, proof, `${where} RED`, false);
  const failures = nodes.filter(isFailure);

  /** @type {{node:TapNode, path:string[]}[]} */
  const declared = [];
  for (const entry of proof.expectRed) {
    const hit = uniqueMatch(nodes, entry.test, `${where} RED`);
    if (!hit || !isFailure(hit)) {
      throw failed(`${where} RED: the declared identity ${JSON.stringify(entry.test)} did not fail under the mutation — the assertion is vacuous, or the mutation does not reach it`);
    }
    const kind = hit.node.diag.failureType;
    if (kind === undefined) {
      throw error(`${where} RED: this Node emits no "failureType" for ${JSON.stringify(entry.test)} — the runner will not assume a failure was an assertion`);
    }
    if (kind !== 'testCodeFailure') {
      throw failed(`${where} RED: ${JSON.stringify(entry.test)} failed as "${kind}", not as an assertion failure of its own body`);
    }
    const code = hit.node.diag.code;
    if (code === undefined) {
      throw error(`${where} RED: this Node emits no error "code" for ${JSON.stringify(entry.test)} — failureType alone does not separate an assertion from a thrown error`);
    }
    if (code !== 'ERR_ASSERTION') {
      throw failed(`${where} RED: ${JSON.stringify(entry.test)} failed with code ${code}, not ERR_ASSERTION — a thrown error is not an assertion failure`);
    }
    if (!hit.node.diag.raw.includes(entry.signal)) {
      throw failed(`${where} RED: the diagnostic for ${JSON.stringify(entry.test)} does not carry its signal ${JSON.stringify(entry.signal)}`);
    }
    declared.push(hit);
  }

  const isDeclared = (entry) => declared.some((d) => samePath(d.path, entry.path));
  for (const entry of failures) {
    if (isDeclared(entry)) continue;
    const kind = entry.node.diag.failureType;
    if (kind === 'testCodeFailure') {
      throw failed(`${where} RED: ${JSON.stringify(entry.path)} failed in its OWN BODY but is not declared — a red whose reason is not the cell's is not a measurement`);
    }
    if (kind === 'subtestsFailed') {
      const attributable = declared.some((d) => d.path.length > entry.path.length && samePath(d.path.slice(0, entry.path.length), entry.path));
      if (attributable) continue;
      throw error(`${where} RED: ${JSON.stringify(entry.path)} propagated a subtest failure the runner cannot attribute to any declared descendant`);
    }
    throw error(`${where} RED: ${JSON.stringify(entry.path)} failed as "${kind}" — a file-, parse-, load-, hook- or suite-level failure, not a measurement`);
  }
  return { failures: failures.length };
}

/**
 * CONTROL: nothing is restored, because nothing was mutated in place. A FRESH
 * pristine copy, run AFTER RED, in its own isolated phase, and it must be green.
 *
 * @param {string} copyDir @param {Object} decl @param {Object} proof @param {string} where
 * @returns {void}
 */
function phaseControl(copyDir, decl, proof, where, root) {
  const run = runSuite(copyDir, normaliseRel(decl.suite), proof.testNamePattern, root);
  assertCompleteRun(run, where, 'CONTROL');
  assertNotAmbiguousSuiteShape(run.stdout, normaliseRel(decl.suite), where, 'CONTROL');
  if (run.status !== 0) {
    throw error(`${where} CONTROL: the post-RED pristine copy was NOT green (exit ${run.status}) — the red was ambient, not the mutation's\n${tail(run.stdout, run.stderr)}`);
  }
  // EXIT 0 IS NOT A CONTROL. A suite whose registration depends on ambient or
  // ordering state can skip, TODO or simply not register every declared test and
  // still exit 0 — which is precisely the drift the post-RED control exists to
  // detect, so accepting the status alone would report PROVEN over a run that
  // asserted nothing. The identities are therefore held to BASELINE's own rules:
  // each observed exactly once, as a terminal PASS, and never zero tests RAN.
  evaluateBaseline(
    flattenTap(parseTap(run.stdout, normaliseRel(decl.suite))),
    proof,
    `${where} CONTROL(post-RED)`
  );
}

/** @param {string} stdout @param {string} stderr @returns {string} the last few lines, for a diagnostic */
function tail(stdout, stderr) {
  const all = `${stdout}\n${stderr}`.split('\n').filter((l) => l.trim().length > 0);
  // The FIRST failing node and its diagnostic, not the tail of the summary: a
  // diagnostic that names only the counts sends a reader back to re-run by hand.
  const at = all.findIndex((l) => /^ *not ok\b/.test(l));
  const lines = at === -1 ? all.slice(-12) : all.slice(at, at + 18);
  return lines.map((l) => `    | ${l}`).join('\n');
}

/**
 * A DIRECTORY COMPONENT FOR ANY LEGAL id, bounded to what a filesystem accepts.
 *
 * Table A puts no length bound on `id` — it is an unrestricted kebab slug — but
 * a path component is capped at 255 bytes on every filesystem this lane runs on.
 * A schema-valid 300-byte id therefore made `mkdirSync` throw ENAMETOOLONG
 * before the phase loop, and the throw escaped `runAll` as a raw stack with no
 * verdict and no footer. The id is kept verbatim while it fits, so diagnostics
 * stay readable, and past that it is truncated with a digest of the WHOLE id
 * appended — the digest is what keeps two ids sharing a long prefix distinct.
 *
 * @param {string} id @returns {string}
 */
function proofDirName(id) {
  const MAX = 200;
  if (Buffer.byteLength(id, 'utf8') <= MAX) return id;
  const digest = crypto.createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 16);
  return `${id.slice(0, MAX - digest.length - 1)}-${digest}`;
}

/**
 * Run one proof through BASELINE, APPLY, RED and CONTROL, each in its own
 * manifest-verified copy derived from the one snapshot. The copies' COMMON
 * PARENT is held non-writable for the lifetime of every child and restored on
 * exit, closing the `..` channel.
 *
 * @param {Object} ctx {snapshot, manifest, sandbox}
 * @param {Object} decl {declFile, suite}
 * @param {Object} proof
 * @param {{control?:boolean}} [opts] `control:false` is the runner's OWN SUITE
 *        proving the UNCONTROLLED verdict; the CLI never sets it
 * @returns {{verdict:string, note:string, applied:boolean}}
 */
function runProof(ctx, decl, proof, opts = {}) {
  const control = opts.control !== false;
  const where = `${decl.declFile} [${proof.id}]`;
  // UNDER `proofs/`, NEVER A SIBLING OF `snapshot`. A proof id is an
  // unrestricted kebab slug (Table A), so `snapshot` is a LEGAL id — and as a
  // sibling it made `parent` equal `ctx.snapshot`: the first phase copied the
  // snapshot into itself and the `finally` deleted the shared snapshot out from
  // under every later proof. A separate namespace removes the collision instead
  // of reserving a word the contract does not reserve.
  const parent = path.join(ctx.sandbox, 'proofs', proofDirName(proof.id));
  try {
    fs.mkdirSync(parent, { recursive: true });
  } catch (e) {
    // Reported, never thrown past the caller: this is the last allocation before
    // the phases, and an uncaught failure here would escape `runAll` as a raw
    // stack with no verdict and no REACH footer.
    return {
      verdict: 'ERROR',
      note: `${where}: the proof's working directory could not be created (${(e && (e.code || e.message)) || e})`,
      applied: false,
    };
  }
  let applied = false;
  try {
    const phases = control ? ['baseline', 'red', 'control'] : ['baseline', 'red'];
    for (const phase of phases) {
      const dir = path.join(parent, phase);
      // BUILT IMMEDIATELY BEFORE ITS OWN PHASE, and deleted immediately after,
      // so no unused copy exists while another phase's child runs. Creating all
      // three up front was measured to be a live channel at PR #204 round 1: a
      // 0500 parent is r-x, which PERMITS TRAVERSAL, so a BASELINE child wrote
      // `../red/subject/subject.js` and APPLY then read the planted bytes.
      unlockSandbox(ctx, parent);
      copyTree(ctx.snapshot, dir);
      if (opts.onPhaseCopy) opts.onPhaseCopy(phase, dir);
      verifyCopy(dir, ctx.manifest);
      preparePhaseDirs(dir);
      if (phase === 'red') {
        applyMutation(dir, proof, `${where} APPLY`, decl.suite);
        applied = true;
      }
      lockSandbox(ctx, parent);
      try {
        if (phase === 'baseline') phaseBaseline(dir, decl, proof, where, ctx.root);
        else if (phase === 'red') phaseRed(dir, decl, proof, where, ctx.root);
        else phaseControl(dir, decl, proof, where, ctx.root);
      } finally {
        unlockSandbox(ctx, parent);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (!control) {
      return {
        verdict: 'UNCONTROLLED',
        note: 'RED was observed but no fresh post-RED pristine control was run',
        applied,
      };
    }
    return { verdict: 'PROVEN', note: proof.why, applied };
  } catch (e) {
    if (e instanceof RedProofError) return { verdict: e.verdict, note: e.message, applied };
    return { verdict: 'ERROR', note: `${where}: ${e && e.stack ? e.stack : e}`, applied };
  } finally {
    try { unlockSandbox(ctx, parent); } catch { /* best effort */ }
    try { fs.rmSync(parent, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/**
 * Hold every writable path the runner provides, except the running phase's own
 * copy, out of reach for the child's lifetime: the copies' parent and the
 * sandbox above it are 0500 (so `../x` and `../../x` cannot be created) and the
 * snapshot is read-only (so `../../snapshot/<file>` cannot be overwritten).
 *
 * Above the sandbox is the ambient temp root, which the runner does not own —
 * that is the LANE LIMIT the REACH footer prints, not a guarantee.
 *
 * @param {Object} ctx @param {string} parent @returns {void}
 */
function lockSandbox(ctx, parent) {
  setSnapshotWritable(ctx.snapshot, ctx.manifest, false);
  fs.chmodSync(parent, 0o500);
  // THE `proofs/` LEVEL IS LOCKED TOO. Moving proof directories into their own
  // namespace put a new writable directory between the phase copy and the
  // sandbox, and `../../<name>` would have reached it — re-opening exactly the
  // traversal channel round 1 closed. Every runner-provided directory on the
  // path from a phase copy up to the sandbox is held non-writable.
  fs.chmodSync(path.dirname(parent), 0o500);
  fs.chmodSync(ctx.sandbox, 0o500);
}

/** @param {Object} ctx @param {string} parent @returns {void} */
function unlockSandbox(ctx, parent) {
  try { fs.chmodSync(ctx.sandbox, 0o700); } catch { /* best effort */ }
  try { fs.chmodSync(path.dirname(parent), 0o700); } catch { /* best effort */ }
  try { fs.chmodSync(parent, 0o700); } catch { /* best effort */ }
  setSnapshotWritable(ctx.snapshot, ctx.manifest, true);
}

// ── The run ──────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @returns {{root:string, wp:string|undefined, proof:string|undefined}}
 */
function parseArgs(argv) {
  const out = { root: path.dirname(__dirname), wp: undefined, proof: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[i + 1];
      if (v === undefined) throw error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--root') out.root = path.resolve(take());
    else if (a === '--wp') out.wp = take();
    else if (a === '--proof') out.proof = take();
    else throw error(`unknown argument ${JSON.stringify(a)} — usage: node ${RUNNER_REL} [--root <dir>] [--wp <WP-id>] [--proof <proof-id>]`);
  }
  return out;
}

/**
 * The whole run. Returns rather than exits, so the runner's own suite can drive
 * it; `main` is what turns the verdict into an exit code.
 *
 * @param {{root?:string, wp?:string, proof?:string, control?:boolean,
 *           onPhaseCopy?:(phase:string, dir:string)=>void,
 *           afterLoad?:(root:string)=>void, host?:{platform?:string, uid?:number|null}}} [opts]
 *        `control:false` and `onPhaseCopy` are the runner's OWN SUITE proving the
 *        `UNCONTROLLED` verdict and the manifest-verification call site; the CLI
 *        sets neither.
 * @returns {{verdict:string, exitCode:number, report:string, proofs:Object[], criteria:Object[]}}
 */
function runAll(opts = {}) {
  let root = opts.root ? path.resolve(opts.root) : path.dirname(__dirname);
  /** @type {string[]} */
  const lines = [];
  const say = (s) => lines.push(s);
  const done = (verdict) => ({
    verdict,
    exitCode: verdict === 'PROVEN' ? 0 : 1,
    report: `${lines.join('\n')}\n\n${REACH}\n`,
    proofs: results,
    criteria: rollup,
  });
  /** @type {Object[]} */
  const results = [];
  /** @type {Object[]} */
  let rollup = [];

  say(`RED proofs — root ${root}`);
  say(`Node ${process.versions.node} (lane floor ${NODE_FLOOR.join('.')})`);

  // The Node floor is checked FIRST: a runner that cannot parse the reporter
  // flags cannot report meaningfully on a declaration set, so UNSUPPORTED wins
  // even over an empty set.
  if (!nodeFloorOk()) {
    say(`UNSUPPORTED: this lane needs Node >= ${NODE_FLOOR.join('.')} for --test-reporter=tap; this is Node ${process.versions.node}.`);
    return done('UNSUPPORTED');
  }

  // Checked beside the Node floor, and for the same reason: a runner that cannot
  // enforce its own isolation cannot report meaningfully on anything else. The
  // runner's own suite injects a HOST DESCRIPTION rather than a ready-made
  // answer, so this call site is what the test exercises; the CLI passes none and
  // the real `process.platform`/`process.getuid()` are read.
  const hostReason = unsupportedHostReason(opts.host);
  if (hostReason) {
    say(`UNSUPPORTED: ${hostReason}.`);
    return done('UNSUPPORTED');
  }

  // THE ROOT IS AN ENTRY IN THE SOURCE DOMAIN TOO, and it was the one entry
  // nothing classified. `path.resolve` leaves a symbolic link intact, so a
  // symlinked `--root` made `buildManifest` walk the link's TARGET while
  // `fs.cpSync` reproduced the LINK as the snapshot and every phase copy — and
  // the mutation was then written THROUGH it into the real tree, outside the
  // sandbox, while the run reported normally (measured at PR #204 round 6: the
  // real target's sha256 changed under a run that never claimed to touch it).
  // Table B row 2a refuses every symlink in the source tree; the root is the
  // outermost one. It is refused here AND resolved, so exactly one root value
  // reaches LOAD, the manifest, the copies and the containment checks — mixing
  // a link with its target is what created the alias in the first place.
  try {
    const st = fs.lstatSync(root);
    if (st.isSymbolicLink()) {
      throw error(`--root is a SYMBOLIC LINK (${root}) — the copy step refuses symlinks, and a linked root would alias the snapshot and every phase copy onto the real tree`);
    }
    if (!st.isDirectory()) {
      throw error(`--root is not a directory (${root})`);
    }
    root = fs.realpathSync(root);
  } catch (e) {
    if (e instanceof RedProofError) {
      say(`${e.verdict}: ${e.message}`);
      return done(e.verdict);
    }
    say(`ERROR: --root could not be classified (${(e && (e.code || e.message)) || e})`);
    return done('ERROR');
  }
  if (root !== (opts.root ? path.resolve(opts.root) : path.dirname(__dirname))) {
    say(`root resolves to ${root}`);
  }

  /** @type {{declFile:string, suite:string, proof:Object}[]} */
  let all;
  /** @type {Map<string,string>} */
  let declDigests;
  try {
    const loaded = loadDeclarations(root);
    all = loaded.proofs;
    declDigests = loaded.digests;
    if (opts.afterLoad) opts.afterLoad(root);
  } catch (e) {
    if (!(e instanceof RedProofError)) throw e;
    say(`${e.verdict}: ${e.message}`);
    return done(e.verdict);
  }

  const selected = all.filter(({ proof }) => (
    (opts.wp === undefined || proof.wp === opts.wp)
    && (opts.proof === undefined || proof.id === opts.proof)
  ));
  say(`${all.length} declared proof(s), ${selected.length} selected`
    + `${opts.wp ? ` [--wp ${opts.wp}]` : ''}${opts.proof ? ` [--proof ${opts.proof}]` : ''}`);
  if (selected.length === 0) {
    say(`VACUOUS: V2 — the selection matched no proof. A selection matching nothing is a vacuous run, not an empty success.`);
    return done('VACUOUS');
  }

  // THE SANDBOX MUST LIE OUTSIDE THE TREE IT SNAPSHOTS, and the ambient TMPDIR
  // decides where it lands. Measured: with `TMPDIR=$PWD/.tmp`, the sandbox — and
  // therefore the SNAPSHOT DESTINATION — becomes a descendant of `--root`, so
  // `fs.cpSync` is asked to copy a tree into itself and the runner writes into
  // the checkout it promises only to read (Table B rows 2 and 2a). Both
  // containments are refused, on REALPATHS, because either nesting breaks the
  // invariant.
  let sandbox;
  try {
    const tmpReal = fs.realpathSync(os.tmpdir());
    // ONE DIRECTION ONLY, and the asymmetry is the point. The defect is the
    // SANDBOX landing inside `--root`, which happens when the temp root is a
    // descendant of it. The reverse — a `--root` that lives under the temp
    // directory — is ordinary and harmless: the sandbox is then a SIBLING of the
    // root, never an ancestor or a descendant, and every fixture tree in this
    // repo's own suite is exactly that shape.
    if (tmpReal === root || tmpReal.startsWith(root + path.sep)) {
      say(`ERROR: the sandbox would be created inside the tree it snapshots — the temp root ${tmpReal} lies under --root ${root}. `
        + 'Point TMPDIR at a directory outside --root; the snapshot destination may not be a descendant of its source.');
      return done('ERROR');
    }
    sandbox = fs.mkdtempSync(path.join(tmpReal, 'wd-redproof-'));
  } catch (e) {
    say(`ERROR: the sandbox could not be created (${(e && (e.code || e.message)) || e})`);
    return done('ERROR');
  }
  let runVerdict = 'PROVEN';
  let applications = 0;
  try {
    const snapshot = path.join(sandbox, 'snapshot');
    let manifest;
    try {
      // CLASSIFY FIRST, COPY SECOND. `fs.cpSync` over a FIFO throws
      // ERR_INTERNAL_ASSERTION — measured — which used to escape `runAll`
      // entirely: no verdict, no REACH footer, a bare stack trace. Building the
      // manifest over `--root` names an unsupported entry before anything is
      // copied, and the copy itself is wrapped so a native failure still lands in
      // the report as the ERROR it is.
      manifest = buildManifest(root);
      try {
        copyTree(root, snapshot);
      } catch (e) {
        throw error(`the snapshot copy failed${e && e.path ? ` at ${e.path}` : ''} (${(e && (e.code || e.message)) || e})`);
      }
      // The snapshot is verified against the manifest too, so a copy that lost or
      // changed something is an ERROR before any phase derives from it.
      verifyCopy(snapshot, manifest);
      // And the declarations the phases will execute must be the ones the
      // snapshot holds — LOAD ran before this, so an edit in the window would
      // otherwise verify cleanly against newer bytes while the run carried the
      // older in-memory proof.
      assertDeclarationsMatchSnapshot(snapshot, declDigests);
    } catch (e) {
      if (!(e instanceof RedProofError)) {
        say(`ERROR: SNAPSHOT — ${(e && (e.code || e.message)) || e}`);
        return done('ERROR');
      }
      say(`ERROR: SNAPSHOT — ${e.message}`);
      return done('ERROR');
    }
    say(`snapshot: ${manifest.size} entries under the declared domain (\`.git/\` and \`node_modules/\` excluded)`);
    say('');

    for (const { declFile, suite, proof } of selected) {
      const r = runProof({ snapshot, manifest, sandbox, root }, { declFile, suite }, proof,
        { control: opts.control, onPhaseCopy: opts.onPhaseCopy });
      if (r.applied) applications += 1;
      results.push({
        id: proof.id, wp: proof.wp, criterion: proof.criterion, verdict: r.verdict, note: r.note, why: proof.why,
      });
      runVerdict = worstVerdict(runVerdict, r.verdict);
      say(`${r.verdict.padEnd(12)} ${proof.id}  (${proof.wp} criterion ${proof.criterion})`);
      // `why` IS PRINTED ON EVERY VERDICT, not only on PROVEN. Table A requires
      // it in the roll-up so a reader sees what the proof is FOR without opening
      // the spec — and a reader needs that most on a FAILED or ERROR, where the
      // note carries the phase diagnostic and nothing else.
      say(`             why: ${proof.why}`);
      if (r.note !== proof.why) say(`             ${r.note}`);
    }
  } finally {
    try { fs.chmodSync(sandbox, 0o700); } catch { /* best effort */ }
    try { fs.chmodSync(path.join(sandbox, 'proofs'), 0o700); } catch { /* best effort */ }
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  // V3: the infrastructure dying silently is this WP's own failure shape.
  if (applications === 0) {
    say('');
    say('VACUOUS: V3 — no mutation was applied while the run reported on proofs.');
    runVerdict = worstVerdict(runVerdict, 'VACUOUS');
  }

  rollup = rollUp(all, selected, results);
  say('');
  say('Criteria:');
  for (const c of rollup) {
    say(`${c.verdict.padEnd(12)} ${c.wp} criterion ${c.criterion} — ${c.note}`);
    runVerdict = worstVerdict(runVerdict, c.verdict);
  }
  say('');
  say(`RUN: ${runVerdict}`);
  return done(runVerdict);
}

/**
 * The (wp, criterion) roll-up. PROVEN only when EVERY declaration for that pair
 * was selected, ran and passed — otherwise FILTERED, naming what was left out.
 * A filtered run that also failed is reported as BOTH.
 *
 * @param {Object[]} all @param {Object[]} selected @param {Object[]} results
 * @returns {Object[]}
 */
function rollUp(all, selected, results) {
  /** A key that cannot be forged by a `wp` or `criterion` containing the
   *  separator — the label is free text, so the separator must not be. */
  const pairKey = (p) => JSON.stringify([p.wp, p.criterion]);
  /** @type {Map<string, {wp:string, criterion:string, declared:string[], selected:string[]}>} */
  const pairs = new Map();
  for (const { proof } of all) {
    const key = pairKey(proof);
    if (!pairs.has(key)) pairs.set(key, { wp: proof.wp, criterion: proof.criterion, declared: [], selected: [] });
    pairs.get(key).declared.push(proof.id);
  }
  for (const { proof } of selected) {
    pairs.get(pairKey(proof)).selected.push(proof.id);
  }
  const byId = new Map(results.map((r) => [r.id, r]));
  const out = [];
  for (const pair of pairs.values()) {
    let verdict = 'PROVEN';
    const contributing = [];
    for (const id of pair.selected) {
      const r = byId.get(id);
      if (!r) continue;
      verdict = worstVerdict(verdict, r.verdict);
      contributing.push(`${id}=${r.verdict}`);
    }
    const left = pair.declared.filter((id) => !pair.selected.includes(id));
    if (left.length > 0) {
      verdict = worstVerdict(verdict, 'FILTERED');
      contributing.push(`left out: ${left.join(', ')}`);
    }
    out.push({
      wp: pair.wp,
      criterion: pair.criterion,
      verdict,
      declared: pair.declared,
      selected: pair.selected,
      note: contributing.length > 0 ? contributing.join('; ') : 'no selected proof',
    });
  }
  return out;
}

/**
 * The report envelope for a failure that happens before a run can start. It
 * carries the ERROR verdict word and the REACH footer, because criterion 10 asks
 * every run — green or red — to end with the footer, and a reader who mistyped a
 * flag is exactly a reader who has not yet learned what the output means.
 *
 * @param {string} message @returns {{verdict:string, exitCode:number, report:string, proofs:Object[], criteria:Object[]}}
 */
function preRunError(message) {
  return { verdict: 'ERROR', exitCode: 1, report: `ERROR: ${message}\n\n${REACH}\n`, proofs: [], criteria: [] };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    // Round 1 dispositioned this as "an unparsable argv is not a run"; the
    // plugin raised it again independently at round 7, and the second reading is
    // the better one — the footer costs nothing and the usage line is still the
    // first thing printed.
    const bad = preRunError(e.message);
    process.exitCode = bad.exitCode;
    process.stdout.write(bad.report);
    return;
  }
  // NOTHING ESCAPES WITHOUT A VERDICT AND A FOOTER. The ENAMETOOLONG path above
  // is fixed at its source, but it was one instance of a general gap: an
  // unexpected throw anywhere under `runAll` would print a stack and no report.
  // Criterion 10 is about every run, so the catch-all is the durable half and
  // the specific fix is the correct one.
  let r;
  try {
    r = runAll(args);
  } catch (e) {
    r = preRunError(`the run failed unexpectedly — ${(e && e.stack) || e}`);
  }
  // `process.exit` DISCARDS whatever is still queued on a pipe. The report ends
  // with the REACH footer criterion 10 requires on every run, and a report long
  // enough to exceed the pipe buffer — many proofs, or one long diagnostic —
  // loses exactly that tail under `| head`, `$(...)` or a CI log collector.
  // Setting `exitCode` and returning lets the event loop drain the write first.
  process.exitCode = r.exitCode;
  process.stdout.write(r.report);
}

if (require.main === module) main();

module.exports = {
  NODE_FLOOR,
  REACH,
  REDIRECTED_ENV_VARS,
  NPM_CWD_VARS,
  XDG_VARS,
  NODE_TEST_RUNNER_VARS,
  VERDICT_ORDER,
  RedProofError,
  worstVerdict,
  preRunError,
  nodeFloorOk,
  unsupportedHostReason,
  loadDeclarations,
  assertDeclarationsMatchSnapshot,
  declarationDigest,
  validateProof,
  buildManifest,
  verifyCopy,
  copyTree,
  phaseEnv,
  runSuite,
  parseTap,
  assertNotAmbiguousSuiteShape,
  flattenTap,
  ranNodes,
  assertTestsRan,
  assertCompleteRun,
  assertNotProtected,
  setSnapshotWritable,
  SUITE_ENTRY_REL,
  evaluateBaseline,
  evaluateRed,
  normaliseRel,
  proofDirName,
  countOccurrences,
  replaceOccurrences,
  resolveInside,
  realpathish,
  applyMutation,
  rollUp,
  runAll,
};
