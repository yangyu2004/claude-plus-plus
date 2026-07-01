import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';
import { openDatabase, listConversations, getConversation, countConversations, listProjects, countProjects, getProject, getLatestImport, getImportMetadata } from '../src/db/database.js';
import { conversationToMarkdown } from '../src/render/markdown.js';
import { buildResumePrompt } from '../src/rehydrate/build-summary-prompt.js';
import { importArchiveFromBuffer } from '../src/import/import-archive.js';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function readFixture(fileName) {
  return fs.readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), 'utf8');
}

function runCli(args, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function makeFixtureZip(extraEntries = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-test-'));
  const zipPath = path.join(tempDir, 'export.zip');
  const zip = new AdmZip();
  zip.addFile('conversations.json', Buffer.from(readFixture('sample-export.json'), 'utf8'));
  for (const [entryName, fixtureName] of Object.entries(extraEntries)) {
    zip.addFile(entryName, Buffer.from(readFixture(fixtureName), 'utf8'));
  }
  zip.writeZip(zipPath);
  return { tempDir, zipPath };
}

test('CLI help documents the package-name command alias', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^claude-plus-plus/m);
  assert.match(result.stdout, /claude-plus-plus import <export\.zip>/);
  assert.match(result.stdout, /Alias:\n  claude-history-rescue-web/m);
});

test('CLI imports an export zip and lists imported conversations', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);
  assert.equal(importResult.stderr, '');
  const importPayload = JSON.parse(importResult.stdout);
  assert.equal(importPayload.imported, 2);
  assert.equal(importPayload.count, 2);
  assert.equal(importPayload.dbPath, dbPath);

  const listResult = await runCli(['list', '--db', dbPath], { cwd: tempDir });
  assert.equal(listResult.code, 0);
  assert.equal(listResult.stderr, '');
  const rows = JSON.parse(listResult.stdout);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.id).sort(), ['conv_1', 'conv_2']);
});

test('imports conversations from an export zip', () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  const documents = readClaudeExportZip(zipPath);
  const conversations = extractConversationsFromDocuments(documents);

  assert.equal(conversations.length, 2);
  assert.equal(conversations[0].title, '项目恢复方案');
  assert.equal(conversations[0].messages.length, 2);
  assert.equal(conversations[1].title, '对话恢复限制');

  const result = importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'export.zip');
  assert.equal(result.imported, 2);

  assert.equal(countConversations(database), 2);
  const found = listConversations(database, { q: '恢复', limit: 10, offset: 0 });
  assert.equal(found.length, 2);

  const detail = getConversation(database, 'conv_1');
  assert.equal(detail.messages.length, 2);
  assert.match(conversationToMarkdown(detail), /项目恢复方案/);
  assert.match(buildResumePrompt(detail), /Original conversation id: conv_1/);
});

test('skips duplicate imports after claiming the import run inside the transaction', () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  const archiveBytes = fs.readFileSync(zipPath);

  const first = importArchiveFromBuffer(database, archiveBytes, 'export.zip');
  const second = importArchiveFromBuffer(database, archiveBytes, 'export.zip');

  assert.equal(first.imported, 2);
  assert.equal(first.skipped, false);
  assert.equal(second.imported, 0);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already-imported');
  assert.equal(countConversations(database), 2);
});

test('serves api and export endpoints', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'export.zip');

  const { createAppServer } = await import('../src/app/server.js');
  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/conversations`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.conversations.length, 2);
  const exportResponse = await fetch(`http://127.0.0.1:${address.port}/export/all`);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-type') || '', /text\/markdown/);
  await app.close();
});

test('server import sanitizes upload names and enforces size limits', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  const { createAppServer } = await import('../src/app/server.js');
  const app = createAppServer({ database, port: 0, importMaxBytes: 64 });
  const address = await app.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const limitedResponse = await fetch(`${baseUrl}/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/zip',
        'x-filename': 'oversized.zip'
      },
      body: Buffer.alloc(128)
    });
    const limitedPayload = await limitedResponse.json();
    assert.equal(limitedResponse.status, 413);
    assert.match(limitedPayload.error, /limit/i);
  } finally {
    await app.close();
  }

  const importApp = createAppServer({ database, port: 0 });
  const importAddress = await importApp.listen();
  const importUrl = `http://127.0.0.1:${importAddress.port}`;

  try {
    const importResponse = await fetch(`${importUrl}/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/zip',
        'x-filename': encodeURIComponent('../escaped/export.zip')
      },
      body: fs.readFileSync(zipPath)
    });
    const importPayload = await importResponse.json();
    assert.equal(importResponse.status, 200);
    assert.equal(importPayload.imported, 2);
    assert.equal(countConversations(database), 2);
    assert.equal(fs.existsSync(path.join(tempDir, 'escaped')), false);
  } finally {
    await importApp.close();
  }
});

test('tracks project archive metadata', async () => {
  const { tempDir, zipPath } = makeFixtureZip({
    'users.json': 'metadata-users.json',
    'memories.json': 'metadata-memories.json',
    'projects/project-alpha.json': 'project-alpha.json'
  });
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'metadata-export.zip');

  assert.equal(countConversations(database), 2);
  assert.equal(countProjects(database), 1);
  const projects = listProjects(database);
  assert.equal(projects[0].uuid, 'project_alpha');
  assert.equal(projects[0].name, 'Portable Metadata Project');
  assert.equal(projects[0].description, 'Synthetic project fixture for import tests.');
  assert.equal(projects[0].creatorUuid, 'user_fixture_1');
  assert.equal(projects[0].creatorName, 'Fixture User');
  assert.equal(projects[0].docs.length, 2);
  assert.equal(projects[0].docs[0].file_name, 'requirements.md');

  const project = getProject(database, projects[0].uuid);
  assert.equal(project.uuid, projects[0].uuid);
  assert.equal(project.docs[1].content, 'The importer should persist checked-in project metadata.');

  const latestImport = getLatestImport(database);
  const metadata = getImportMetadata(database, latestImport.source_hash);
  assert.equal(Array.isArray(metadata.projectsJson), true);
  assert.equal(metadata.projectsJson.length, 1);
  assert.equal(metadata.projectsJson[0].uuid, 'project_alpha');
  assert.equal(Array.isArray(metadata.usersJson), true);
  assert.equal(metadata.usersJson[0].uuid, 'user_fixture_1');
  assert.equal(metadata.usersJson[0].email_address, 'fixture@example.com');
  assert.equal(Array.isArray(metadata.memoriesJson), true);
  assert.equal(metadata.memoriesJson[0].content, 'Remember that synthetic fixtures keep tests portable.');

  const { createAppServer } = await import('../src/app/server.js');
  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();
  const overview = await fetch(`http://127.0.0.1:${address.port}/api/overview`).then((res) => res.json());
  const projectsPayload = await fetch(`http://127.0.0.1:${address.port}/api/projects`).then((res) => res.json());
  const projectPayload = await fetch(`http://127.0.0.1:${address.port}/api/projects/${encodeURIComponent(projects[0].uuid)}`).then((res) => res.json());
  assert.equal(overview.conversations, 2);
  assert.equal(overview.projects, 1);
  assert.equal(overview.docs, 2);
  assert.equal(overview.memories, 1);
  assert.equal(projectsPayload.projects.length, 1);
  assert.equal(projectsPayload.projects[0].name, 'Portable Metadata Project');
  assert.equal(projectPayload.project.uuid, projects[0].uuid);
  assert.equal(projectPayload.project.docs[0].content, 'Use synthetic metadata in tests.');
  await app.close();
});
