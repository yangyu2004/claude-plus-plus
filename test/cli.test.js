import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';
import { openDatabase, listConversations, getConversation, countConversations, listProjects, countProjects, getProject, getLatestImport, getImportMetadata } from '../src/db/database.js';
import { conversationToMarkdown } from '../src/render/markdown.js';
import { buildResumePrompt } from '../src/rehydrate/build-summary-prompt.js';
import { createAppServer } from '../src/app/server.js';
import { importArchiveFromBuffer } from '../src/import/import-archive.js';
import { fileURLToPath } from 'node:url';

function makeFixtureZip() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-test-'));
  const zipPath = path.join(tempDir, 'export.zip');
  const zip = new AdmZip();
  const fixture = fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url), 'utf8');
  zip.addFile('conversations.json', Buffer.from(fixture, 'utf8'));
  zip.writeZip(zipPath);
  return { tempDir, zipPath };
}

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

test('serves HTML and conversation api', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'export.zip');

  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/conversations`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.conversations.length, 2);
  await app.close();
});

test('tracks project archive metadata', async () => {
  const zipPath = '/Users/jiangyou/Downloads/斯斯Claude 数据备份 2026.06.26 HoneyBunchdjv@rocketship.com.zip';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-real-'));
  const database = openDatabase(path.join(tempDir, 'history.sqlite'));
  importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'sample.zip');

  assert.equal(countConversations(database), 98);
  assert.equal(countProjects(database), 10);
  const projects = listProjects(database);
  assert.equal(projects[0].name.length > 0, true);
  assert.ok(projects.some((project) => project.docs.length > 0));

  const project = getProject(database, projects[0].uuid);
  assert.equal(project.uuid, projects[0].uuid);

  const latestImport = getLatestImport(database);
  const metadata = getImportMetadata(database, latestImport.source_hash);
  assert.equal(Array.isArray(metadata.projectsJson), true);
  assert.equal(Array.isArray(metadata.usersJson) || typeof metadata.usersJson === 'object', true);
  assert.equal(Array.isArray(metadata.memoriesJson), true);

  const app = createAppServer({ database, port: 0 });
  const address = await app.listen();
  const overview = await fetch(`http://127.0.0.1:${address.port}/api/overview`).then((res) => res.json());
  const projectsPayload = await fetch(`http://127.0.0.1:${address.port}/api/projects`).then((res) => res.json());
  const projectPayload = await fetch(`http://127.0.0.1:${address.port}/api/projects/${encodeURIComponent(projects[0].uuid)}`).then((res) => res.json());
  assert.equal(overview.conversations, 98);
  assert.equal(overview.projects, 10);
  assert.equal(projectsPayload.projects.length, 10);
  assert.equal(projectPayload.project.uuid, projects[0].uuid);
  await app.close();
});
