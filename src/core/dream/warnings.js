'use strict';

/**
 * The vault warnings file (WP-quarantine-warnings-file, ADR-0023 Amendment 2).
 *
 * WHAT THIS IS. One generated markdown file in the vault — `reports/warnings.md`
 * — that says which session transcripts the dream could not read, and one
 * function that brings it up to date during a dream run. ADR-0004: just files.
 * Nothing here starts a process or keeps state between calls.
 *
 * WHY IT EXISTS. A quarantine used to leave no durable trace anywhere the user
 * owns: the only surface was a banner inside the managed block, which every
 * `sync` re-renders and most users do not version. The vault IS versioned, so a
 * file that changes exactly when its rendered content changes gives the user a
 * permanent, diffable record. It is the family's ROOT surface: the full list of
 * quarantined transcripts lives here and nowhere else, and every other surface
 * carries counts plus a pointer to this path, never a list.
 *
 * TWO PROPERTIES THIS MODULE IS BUILT AROUND.
 *
 *   1. THE RENDER IS A PURE FUNCTION OF THE LEDGER ALONE. `composeWarnings`
 *      takes one argument and is never shown the file on disk, no clock and no
 *      carried snapshot. So no byte a user (or any other process) leaves in the
 *      file can be laundered into Wienerdog's own render: a rewrite REPLACES
 *      the file in full, and nothing of the previous one survives.
 *   2. THE RENDER IS ALSO THE REWRITE TRIGGER. The write decision is one byte
 *      comparison between that render and the bytes on disk — not a tuple of
 *      the facts the file happens to show. A second structure would have to be
 *      kept in step with the renderer by hand, and the failure mode is silent:
 *      add a rendered fact and forget the tuple, and the trigger goes blind to
 *      it. Comparing the rendered document makes "the trigger sees everything
 *      the file shows" true by construction.
 *
 * ONE COMPOSER, AND THAT IS A CONTRACT. `composeWarnings` assembles this
 * document at exactly one site and has exactly two callers: `refreshWarnings`
 * below, and — once the dream commit becomes a render-versus-HEAD
 * reconciliation — the commit's own render. Those two must produce byte-equal
 * output for the same ledger; one function makes that true by construction,
 * where two could only be kept equal by review.
 *
 * WHAT IS NEVER RENDERED. Transcript content, a full path, and a STORED reason
 * string — an unrecognized reason falls into a fixed heading instead, because
 * `readLedger` deliberately does not validate individual records and rendering
 * a stored string would let stored data choose this document's bytes. Names go
 * through the shared `displayName` sanitizer, the same one the digest banner
 * and the dream console lines use, so no filename can forge a heading, a list
 * entry or a line break.
 *
 * NAMED RESIDUAL — the pre-promotion commit window. The RENDER half of the
 * property above holds from day one. The COMMIT half — "no byte from disk
 * enters Wienerdog's own record" — holds with full force only once the dream
 * commit is a reconciliation; until then the run's wholesale `git add -A`
 * staging still commits whatever is on disk, so during that window this file's
 * integrity level is any vault note's.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  displayName,
  quarantineSizeBytes,
  SECRET_REVERT_EXHAUSTED_REASON,
  PRESERVED_COPIES_POINTER,
} = require('./ledger');
const { writeIntoVault } = require('./vault-write');

/**
 * The vault-relative path of the warnings file — the ONE place it is decided.
 * Consumers (`wienerdog doctor`, and anything else that needs to name it
 * outside a fixed English sentence) import this rather than retyping it.
 *
 * Deliberately layout-independent: this is not a dream report, so it does not
 * live under `vault_layout.reports_dir`, whose newest-N scoping would let a
 * warnings file displace a real dream report from a routine's window.
 */
const WARNINGS_REL = 'reports/warnings.md';

/** Bytes per MiB, for the size suffix on an over-ceiling entry. */
const BYTES_PER_MB = 1048576;

/** The document's fixed opening paragraph. Says who owns the file and what
 *  makes it change, in the plain register the product's user-facing text uses. */
const HEADER_PARAGRAPH =
  'Wienerdog writes this file itself, from its own record of which session\n' +
  'transcripts it could not read. Do not edit it — it is rewritten whenever the list\n' +
  'below changes.';

/** The one remediation line in the document, and it rides ONE group: a
 *  secret-exhausted quarantine is the single class the user can act on.
 *  Imported from `ledger.js`'s `PRESERVED_COPIES_POINTER` rather than
 *  retyped, so this line and the other ledger-derived surfaces have exactly
 *  one author (Table L row L0, `WP-quarantine-banner-location`). */
const SECRET_EXHAUSTED_REMEDIATION = PRESERVED_COPIES_POINTER;

/**
 * The reason → heading map, IN EMISSION ORDER, and the single place these
 * strings are decided. The reason enum's canonical source is `ledger.js`; this
 * table maps it onto THIS file's text. Other surfaces (the terminal counts in
 * `doctor`) map the same enum onto deliberately different text and own their
 * own table, so there is no shared string set that can drift.
 *
 * The last row has no `reason` and is the catch-all: a record whose reason is
 * missing, not a string, or from a schema this version does not know still gets
 * named, under a fixed heading — never under its stored string.
 * @type {Array<{reason:string|null, heading:string, note?:string, size?:boolean}>}
 */
const GROUPS = [
  {
    reason: 'over-ceiling',
    heading: 'The session file is bigger than Wienerdog will read',
    size: true,
  },
  { reason: 'too-many-lines', heading: 'The session file has too many lines to read' },
  { reason: 'read-error', heading: 'The session file could not be read' },
  {
    reason: SECRET_REVERT_EXHAUSTED_REASON,
    heading:
      'The notes made from these sessions were withheld by the secret check too many times in a row',
    note: SECRET_EXHAUSTED_REMEDIATION,
  },
  { reason: null, heading: 'Skipped for a reason this version does not recognize' },
];

/** @param {unknown} v @returns {boolean} */
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The quarantined records of a ledger, grouped by GROUPS row and sorted by
 * sanitized name inside each group. Shared by the render and by the may-I-
 * create-the-file question, so both see exactly the same membership.
 * @param {object} ledger
 * @returns {Array<{group:{reason:string|null, heading:string, note?:string, size?:boolean},
 *                  entries:Array<{name:string, size:number|null}>}>}
 */
function groupQuarantines(ledger) {
  const files = isPlainObject(ledger) && isPlainObject(ledger.files) ? ledger.files : {};
  const buckets = GROUPS.map((group) => ({ group, entries: /** @type {Array<{name:string, size:number|null}>} */ ([]) }));
  const fallback = buckets[buckets.length - 1];
  for (const [key, rec] of Object.entries(files)) {
    if (!isPlainObject(rec) || rec.outcome !== 'quarantined') continue;
    const bucket = buckets.find((b) => b.group.reason !== null && b.group.reason === rec.reason) || fallback;
    bucket.entries.push({ name: displayName(key), size: quarantineSizeBytes(rec) });
  }
  for (const b of buckets) {
    b.entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  }
  return buckets;
}

/**
 * Compose the CANONICAL bytes of the whole warnings file for a ledger.
 *
 * PURE, and pure of the LEDGER ALONE: no filesystem, no clock, no second
 * argument. Two calls on one ledger are byte-equal, and no byte that is on disk
 * can influence the result, because the function is never shown it.
 *
 * It is the family's ONLY composer of this document, and that is a contract,
 * not a convenience: both callers use it and neither assembles bytes of its own,
 * so the bytes a refresh writes and the bytes a commit renders cannot drift
 * apart. Because the render is total, it is ALSO the rewrite trigger's operand.
 *
 * @param {object} ledger
 * @returns {Buffer} the whole file, always — an empty quarantine set renders the
 *   explicit "nothing is being skipped" form, never nothing. WHETHER that render
 *   is written is the refresh's decision, not this function's.
 */
function composeWarnings(ledger) {
  const buckets = groupQuarantines(ledger).filter((b) => b.entries.length > 0);
  /** @type {string[]} blocks, joined by exactly one blank line */
  const blocks = ['# Wienerdog warnings', HEADER_PARAGRAPH, '## Current conditions'];
  if (buckets.length === 0) {
    blocks.push('No session transcripts are being skipped.');
  } else {
    for (const b of buckets) {
      blocks.push(`### ${b.group.heading} — ${b.entries.length}`);
      if (b.group.note) blocks.push(b.group.note);
      blocks.push(
        b.entries
          .map((e) => {
            if (!b.group.size || e.size === null) return `- ${e.name}`;
            const mb = (e.size / BYTES_PER_MB).toFixed(1);
            return `- ${e.name} — ${mb} MB (${e.size} bytes)`;
          })
          .join('\n')
      );
    }
  }
  return Buffer.from(`${blocks.join('\n\n')}\n`, 'utf8');
}

/** The caller's policy for the publish: this module admits its own fixed path
 *  and nothing else. Applied to the RESOLVED vault-relative path, so a
 *  symlinked `reports/` that lands the write elsewhere is refused here.
 *  @param {string} resolvedRel @returns {string|null} */
function admitWarningsPath(resolvedRel) {
  if (resolvedRel === WARNINGS_REL) return null;
  return `only ${WARNINGS_REL} may be written by this module (the path resolved to ${resolvedRel})`;
}

/**
 * Refresh the vault warnings file for one moment of one dream run.
 *
 * Reads the file, composes with `composeWarnings`, and writes ONLY when the
 * file does not already hold exactly those bytes:
 *
 *   - present and different  → write the render (the last quarantine clearing
 *                              rewrites the file to say so; it is never deleted)
 *   - present and equal      → no write at all, so an unchanged ledger causes no
 *                              churn in the vault's history
 *   - absent, set non-empty  → write the render (the reconciliation that gives
 *                              an install whose quarantines are all pre-existing
 *                              the file it was promised)
 *   - absent, set empty      → no write; a vault that never had a quarantine
 *                              gets no file
 *
 * Never throws: every failure is reported by return. Holds no state between
 * calls — there is nothing to carry, because the decision is a byte comparison
 * against the file itself, so a refused write needs no bookkeeping to be
 * retried: the next refresh point simply re-reads and re-decides.
 *
 * @param {{vaultDir:string, ledger:object}} o
 * @returns {{written:boolean, reason?:string}} `reason` is present only on a
 *   FAILURE (an unreadable file, a refused publish). A deliberate no-op returns
 *   `{written:false}` with no reason, so a caller can report failures without
 *   narrating every quiet run.
 */
function refreshWarnings(o) {
  const opts = o || {};
  try {
    const render = composeWarnings(opts.ledger);
    const abs = path.join(opts.vaultDir, ...WARNINGS_REL.split('/'));

    /** @type {Buffer|null} the bytes on disk, or null when the file is absent */
    let current = null;
    // Judge the LEAF before opening it. `lstat` does not follow a symlink, so a
    // link, a directory or a special file is refused here without the linked
    // object ever being opened.
    //
    // This is not tidiness: a plain `readFileSync` on a symlink pointing at a
    // FIFO BLOCKS FOREVER waiting for a writer. The dream would never return,
    // the process would never exit, and that night's consolidation would be
    // silently lost — the exact fail-loud-instead-of-fail-safe outcome ADR-0023
    // exists to prevent. A refusal by return costs the enumeration for one run
    // and nothing else.
    //
    // NARROWING, not prevention, and the limit is stated rather than implied: a
    // leaf swapped between this check and the read below is still followed.
    // That is the same component-swap class portable Node cannot close, already
    // carried as residual A by this family's write primitive.
    let leaf = null;
    try {
      leaf = fs.lstatSync(abs);
    } catch (e) {
      // ENOENT is the absent case. Any other stat failure is NOT: never guess
      // at the file's content, and never overwrite a file we could not read.
      if (!e || e.code !== 'ENOENT') {
        return {
          written: false,
          reason: `${WARNINGS_REL} could not be read (${(e && e.code) || (e && e.message)})`,
        };
      }
    }
    if (leaf !== null) {
      if (!leaf.isFile()) {
        return {
          written: false,
          reason: `${WARNINGS_REL} could not be read (something other than a regular file is at that path)`,
        };
      }
      try {
        current = fs.readFileSync(abs);
      } catch (e) {
        return {
          written: false,
          reason: `${WARNINGS_REL} could not be read (${(e && e.code) || (e && e.message)})`,
        };
      }
    }

    /** @param {Buffer} [expect] omitted asserts the target must not exist */
    const publish = (expect) => {
      const res = writeIntoVault({
        vaultDir: opts.vaultDir,
        rel: WARNINGS_REL,
        bytes: render,
        admit: admitWarningsPath,
        ...(expect === undefined ? {} : { expect }),
      });
      return res.written ? { written: true } : { written: false, reason: res.reason };
    };

    if (current !== null) {
      // The bytes read are the comparison operand and the publish's premise, and
      // nothing else: no part of them reaches the composed document.
      if (current.equals(render)) return { written: false };
      return publish(current);
    }
    // The ONLY place the set size is consulted: may this run CREATE the file?
    const hasQuarantine = groupQuarantines(opts.ledger).some((b) => b.entries.length > 0);
    if (!hasQuarantine) return { written: false };
    return publish();
  } catch (e) {
    return {
      written: false,
      reason: `${WARNINGS_REL} could not be refreshed (${(e && e.message) || e})`,
    };
  }
}

module.exports = { WARNINGS_REL, composeWarnings, refreshWarnings };
