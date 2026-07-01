import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
    assert.equal(path.basename(latestImport.source_path), 'export.zip');
    assert.notEqual(path.dirname(latestImport.source_path), escapeDir);
    assert.match(path.basename(path.dirname(latestImport.source_path)), /^claude-history-rescue-/);
    assert.ok(!latestImport.source_path.includes('..'));
  } finally {
    fs.rmSync(escapeDir, { recursive: true, force: true });
  }
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
