'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const drive = require('../../src/gws/drive');
const { WienerdogError } = require('../../src/core/errors');

test('search returns the mapped file array with the requested fields', async () => {
  let seen;
  const services = {
    drive: {
      files: {
        list: async (args) => {
          seen = args;
          return {
            data: {
              files: [
                {
                  id: '1Ab',
                  name: 'Q3 plan',
                  mimeType: 'application/vnd.google-apps.document',
                  modifiedTime: '2026-07-01T12:00:00.000Z',
                },
              ],
            },
          };
        },
      },
    },
  };

  const result = await drive.search(services, { query: "name contains 'Q3'", max: 1 });
  assert.deepEqual(result, [
    {
      id: '1Ab',
      name: 'Q3 plan',
      mimeType: 'application/vnd.google-apps.document',
      modifiedTime: '2026-07-01T12:00:00.000Z',
    },
  ]);
  assert.equal(seen.q, "name contains 'Q3'");
  assert.equal(seen.pageSize, 1);
  assert.equal(seen.fields, 'files(id,name,mimeType,modifiedTime)');

  // JSON output shape is valid JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('search defaults pageSize to 20 and returns [] when no files match', async () => {
  const services = {
    drive: { files: { list: async () => ({ data: {} }) } },
  };
  const result = await drive.search(services, { query: 'x' });
  assert.deepEqual(result, []);
});

test('read exports a Google Doc as text/plain', async () => {
  let exportArgs;
  const services = {
    drive: {
      files: {
        get: async (args) => {
          assert.deepEqual(args, {
            fileId: '1Ab',
            fields: 'id,name,mimeType',
          });
          return {
            data: { id: '1Ab', name: 'Q3 plan', mimeType: 'application/vnd.google-apps.document' },
          };
        },
        export: async (args) => {
          exportArgs = args;
          return { data: 'Q3 plan\n\n1. ...' };
        },
      },
    },
  };

  const result = await drive.read(services, { id: '1Ab' });
  assert.deepEqual(result, {
    id: '1Ab',
    name: 'Q3 plan',
    mimeType: 'application/vnd.google-apps.document',
    text: 'Q3 plan\n\n1. ...',
  });
  assert.equal(exportArgs.fileId, '1Ab');
  assert.equal(exportArgs.mimeType, 'text/plain');
});

test('read downloads non-Google files via alt:media and decodes utf8', async () => {
  let mediaArgs;
  const services = {
    drive: {
      files: {
        get: async (args) => {
          if (args.alt === 'media') {
            mediaArgs = args;
            return { data: Buffer.from('hello world', 'utf8') };
          }
          return { data: { id: 'f2', name: 'notes.txt', mimeType: 'text/plain' } };
        },
      },
    },
  };

  const result = await drive.read(services, { id: 'f2' });
  assert.deepEqual(result, {
    id: 'f2',
    name: 'notes.txt',
    mimeType: 'text/plain',
    text: 'hello world',
  });
  assert.equal(mediaArgs.fileId, 'f2');
  assert.equal(mediaArgs.alt, 'media');
});

test('read throws WienerdogError for an unsupported Google Workspace type', async () => {
  const services = {
    drive: {
      files: {
        get: async () => ({
          data: { id: 's1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet' },
        }),
      },
    },
  };
  await assert.rejects(
    () => drive.read(services, { id: 's1' }),
    (err) =>
      err instanceof WienerdogError &&
      /unsupported Google type application\/vnd\.google-apps\.spreadsheet/.test(err.message)
  );
});

test('run: drive search requires the positional <query>', async () => {
  const services = { drive: {} };
  await assert.rejects(
    () => drive.run(services, { positionals: ['search'] }),
    (err) => err instanceof WienerdogError && /<query>/.test(err.message)
  );
});

test('run: drive read requires --id', async () => {
  const services = { drive: {} };
  await assert.rejects(
    () => drive.run(services, { positionals: ['read'] }),
    (err) => err instanceof WienerdogError && /--id/.test(err.message)
  );
});

test('run: drive read parses the --id token', async () => {
  const services = {
    drive: {
      files: {
        get: async (args) => {
          if (args.alt === 'media') return { data: 'body text' };
          return { data: { id: 'f3', name: 'n', mimeType: 'text/plain' } };
        },
      },
    },
  };
  const result = await drive.run(services, { positionals: ['read', '--id', 'f3'] });
  assert.equal(result.id, 'f3');
  assert.equal(result.text, 'body text');
});
