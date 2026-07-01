import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { openDatabase, getLatestImport } from '../src/db/database.js';
import { createAppServer } from '../src/app/server.js';
import { importArchiveFromBuffer } from '../src/import/import-archive.js';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';

function readFixture(fileName) {
  return fs.readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), 'utf8');
}

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [entryName, content] of Object.entries(entries)) {
    zip.addFile(entryName, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

function makeFixtureZipBuffer() {
  return makeZip({
    'conversations.json': readFixture('sample-export.json')
  });
}

function makeTempDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-safety-'));
  return {
    tempDir,
    database: openDatabase(path.join(tempDir, 'history.sqlite'))
  };
}

test('app server defaults to loopback host without wildcard CORS', async () => {
  const { database } = makeTempDatabase();
  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();

  try {
    assert.equal(address.address, '127.0.0.1');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/overview`);
    assert.equal(response.status, 200);
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');

    const preflight = await fetch(`http://127.0.0.1:${address.port}/import`, {
      method: 'OPTIONS',
      headers: { origin: 'http://example.invalid' }
    });
    assert.equal(preflight.status, 204);
    assert.notEqual(preflight.headers.get('access-control-allow-origin'), '*');
  } finally {
    await app.close();
  }
});

test('/import rejects uploads larger than the configured limit', async () => {
  const { database } = makeTempDatabase();
  const app = createAppServer({ database, port: 0, importMaxBytes: 8 });
  const address = await app.listen();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/import`, {
      method: 'POST',
      body: Buffer.alloc(16),
      headers: { 'x-filename': 'export.zip' }
    });
    const payload = await response.json();

    assert.equal(response.status, 413);
    assert.match(payload.error, /exceeds/i);
  } finally {
    await app.close();
  }
});

test('importArchiveFromBuffer stores sanitized upload filenames inside the temp directory', () => {
  const { database } = makeTempDatabase();
  const escapeDirName = `unsafe-export-escape-${Date.now()}`;
  const escapeDir = path.join(os.tmpdir(), escapeDirName);
  fs.mkdirSync(escapeDir, { recursive: true });

  try {
    const result = importArchiveFromBuffer(database, makeFixtureZipBuffer(), `../${escapeDirName}/export.zip`);
    const latestImport = getLatestImport(database);

    assert.equal(result.imported, 2);
    assert.match(path.basename(latestImport.source_path), /^export\.zip\.[0-9a-f]{8}$/);
    assert.notEqual(path.dirname(latestImport.source_path), escapeDir);
    assert.match(path.basename(path.dirname(latestImport.source_path)), /^claude-history-rescue-/);
    assert.ok(!latestImport.source_path.includes('..'));
  } finally {
    fs.rmSync(escapeDir, { recursive: true, force: true });
  }
});

function makeRawZip(entryName, content) {
  const nameBuf = Buffer.from(entryName);
  const contentBuf = Buffer.from(content, 'utf8');
  const crc = zlib.crc32(contentBuf);

  // Local file header
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // compression (stored)
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(crc, 14); // crc
  localHeader.writeUInt32LE(contentBuf.length, 18); // compressed size
  localHeader.writeUInt32LE(contentBuf.length, 22); // uncompressed size
  localHeader.writeUInt16LE(nameBuf.length, 26); // name length
  localHeader.writeUInt16LE(0, 28); // extra length

  // Central directory header
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0); // signature
  cdHeader.writeUInt16LE(20, 4); // version made by
  cdHeader.writeUInt16LE(20, 6); // version needed
  cdHeader.writeUInt16LE(0, 8); // flags
  cdHeader.writeUInt16LE(0, 10); // compression
  cdHeader.writeUInt16LE(0, 12); // mod time
  cdHeader.writeUInt16LE(0, 14); // mod date
  cdHeader.writeUInt32LE(crc, 16); // crc
  cdHeader.writeUInt32LE(contentBuf.length, 20); // compressed size
  cdHeader.writeUInt32LE(contentBuf.length, 24); // uncompressed size
  cdHeader.writeUInt16LE(nameBuf.length, 28); // name length
  cdHeader.writeUInt16LE(0, 30); // extra length
  cdHeader.writeUInt16LE(0, 32); // comment length
  cdHeader.writeUInt16LE(0, 34); // disk number start
  cdHeader.writeUInt16LE(0, 36); // internal attr
  cdHeader.writeUInt32LE(0, 38); // external attr
  cdHeader.writeUInt32LE(0, 42); // local header offset

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD
  eocd.writeUInt16LE(1, 8); // CD entries on this disk
  eocd.writeUInt16LE(1, 10); // total CD entries
  eocd.writeUInt32LE(cdHeader.length + nameBuf.length, 12); // CD size
  eocd.writeUInt32LE(localHeader.length + nameBuf.length + contentBuf.length, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localHeader, nameBuf, contentBuf, cdHeader, nameBuf, eocd]);
}

test('readClaudeExportZip rejects entries with path traversal (..)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-zip-traversal-'));
  const zipPath = path.join(tempDir, 'traversal.zip');
  fs.writeFileSync(zipPath, makeRawZip('../etc/passwd.json', '{}'));

  assert.throws(
    () => readClaudeExportZip(zipPath),
    /path traversal/i
  );
});

test('readClaudeExportZip rejects entries starting with a path separator', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-zip-sep-'));
  const zipPath = path.join(tempDir, 'sep.zip');
  fs.writeFileSync(zipPath, makeRawZip('/etc/passwd.json', '{}'));

  assert.throws(
    () => readClaudeExportZip(zipPath),
    /absolute path/i
  );
});

test('readClaudeExportZip rejects entries with backslash path separators', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-zip-backslash-'));
  const zipPath = path.join(tempDir, 'backslash.zip');
  fs.writeFileSync(zipPath, makeRawZip('\\windows\\system32\\evil.json', '{}'));

  assert.throws(
    () => readClaudeExportZip(zipPath),
    /path separator/i
  );
});

test('readClaudeExportZip allows valid nested paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-zip-valid-'));
  const zipPath = path.join(tempDir, 'valid.zip');
  const zip = new AdmZip();
  zip.addFile('nested/folder/file.json', Buffer.from('{"hello":"world"}', 'utf8'));
  zip.writeZip(zipPath);

  const docs = readClaudeExportZip(zipPath);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].path, 'nested/folder/file.json');
});

test('readClaudeExportZip enforces basic entry count and entry size limits', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-zip-limits-'));
  const zipPath = path.join(tempDir, 'too-many.zip');
  const zip = new AdmZip();
  zip.addFile('one.json', Buffer.from('{}', 'utf8'));
  zip.addFile('two.json', Buffer.from('{}', 'utf8'));
  zip.writeZip(zipPath);

  assert.throws(
    () => readClaudeExportZip(zipPath, { maxEntries: 1 }),
    /too many/i
  );

  const largePath = path.join(tempDir, 'too-large.zip');
  const largeZip = new AdmZip();
  largeZip.addFile('large.json', Buffer.from('{"data":"' + 'x'.repeat(32) + '"}', 'utf8'));
  largeZip.writeZip(largePath);

  assert.throws(
    () => readClaudeExportZip(largePath, { maxEntryBytes: 8 }),
    /too large/i
  );
});

test('/import rejects requests without x-import-token when CLAUDE_PLUS_PLUS_IMPORT_TOKEN is set', async () => {
  const { database } = makeTempDatabase();
  const originalToken = process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
  process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN = 'secret-token-123';

  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/import`, {
      method: 'POST',
      body: makeFixtureZipBuffer(),
      headers: { 'x-filename': 'export.zip' }
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.match(payload.error, /Unauthorized/i);
    assert.match(payload.error, /x-import-token/i);
  } finally {
    await app.close();
    if (originalToken === undefined) {
      delete process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
    } else {
      process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN = originalToken;
    }
  }
});

test('/import allows requests with valid x-import-token when CLAUDE_PLUS_PLUS_IMPORT_TOKEN is set', async () => {
  const { database } = makeTempDatabase();
  const originalToken = process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
  process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN = 'secret-token-123';

  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/import`, {
      method: 'POST',
      body: makeFixtureZipBuffer(),
      headers: {
        'x-filename': 'export.zip',
        'x-import-token': 'secret-token-123'
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.imported, 2);
  } finally {
    await app.close();
    if (originalToken === undefined) {
      delete process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
    } else {
      process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN = originalToken;
    }
  }
});

test('/import allows requests without token when CLAUDE_PLUS_PLUS_IMPORT_TOKEN is not set', async () => {
  const { database } = makeTempDatabase();
  const originalToken = process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
  delete process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;

  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/import`, {
      method: 'POST',
      body: makeFixtureZipBuffer(),
      headers: { 'x-filename': 'export.zip' }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.imported, 2);
  } finally {
    await app.close();
    if (originalToken === undefined) {
      delete process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN;
    } else {
      process.env.CLAUDE_PLUS_PLUS_IMPORT_TOKEN = originalToken;
    }
  }
});
