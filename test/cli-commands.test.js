import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { openDatabase, listConversations, getConversation, countConversations } from '../src/db/database.js';
import { importArchiveFromBuffer } from '../src/import/import-archive.js';

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

function makeTempDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-test-'));
  const dbPath = path.join(tempDir, 'history.sqlite');
  const database = openDatabase(dbPath);
  return { tempDir, dbPath, database };
}

function seedDatabase(database, zipPath) {
  const result = importArchiveFromBuffer(database, fs.readFileSync(zipPath), 'export.zip');
  return result;
}

test('CLI rehydrate --id writes prompt.md with expected content', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const outFile = path.join(tempDir, 'prompt.md');
  const rehydrateResult = await runCli(['rehydrate', '--id', 'conv_1', '--db', dbPath, '--out', outFile], { cwd: tempDir });
  assert.equal(rehydrateResult.code, 0);
  assert.equal(rehydrateResult.stderr, '');

  assert.equal(fs.existsSync(outFile), true);
  const content = fs.readFileSync(outFile, 'utf8');
  assert.match(content, /You are resuming a prior Claude conversation from an imported archive\./);
  assert.match(content, /Conversation title: 项目恢复方案/);
  assert.match(content, /Original conversation id: conv_1/);
  assert.match(content, /Context summary:/);
  assert.match(content, /user: 我有一份 Claude 导出，想把它重新索引起来。/);
  assert.match(content, /可以先导入本地 SQLite，再用本地 UI 浏览。/);
  assert.match(content, /Please continue from this context and preserve the original intent\./);
});

test('CLI rehydrate without --out prints to stdout', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const rehydrateResult = await runCli(['rehydrate', '--id', 'conv_2', '--db', dbPath], { cwd: tempDir });
  assert.equal(rehydrateResult.code, 0);
  assert.equal(rehydrateResult.stderr, '');
  assert.match(rehydrateResult.stdout, /Conversation title: 对话恢复限制/);
  assert.match(rehydrateResult.stdout, /Original conversation id: conv_2/);
});

test('CLI rehydrate fails for missing conversation id', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const rehydrateResult = await runCli(['rehydrate', '--id', 'nonexistent', '--db', dbPath], { cwd: tempDir });
  assert.equal(rehydrateResult.code, 1);
  assert.match(rehydrateResult.stderr, /Conversation not found: nonexistent/);
});

test('CLI export --out produces Markdown files for all conversations', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const outDir = path.join(tempDir, 'exported');
  const exportResult = await runCli(['export', '--out', outDir, '--db', dbPath], { cwd: tempDir });
  assert.equal(exportResult.code, 0);
  assert.equal(exportResult.stderr, '');
  assert.match(exportResult.stdout, /2 conversation\(s\) exported to/);

  const files = fs.readdirSync(outDir);
  assert.equal(files.length, 2);

  const conv1File = files.find((f) => f.includes('conv_1'));
  const conv2File = files.find((f) => f.includes('conv_2'));
  assert.ok(conv1File, 'Expected a file containing conv_1');
  assert.ok(conv2File, 'Expected a file containing conv_2');

  const conv1Content = fs.readFileSync(path.join(outDir, conv1File), 'utf8');
  assert.match(conv1Content, /# 项目恢复方案/);
  assert.match(conv1Content, /Conversation ID: `conv_1`/);
  assert.match(conv1Content, /## user/);
  assert.match(conv1Content, /## assistant/);

  const conv2Content = fs.readFileSync(path.join(outDir, conv2File), 'utf8');
  assert.match(conv2Content, /# 对话恢复限制/);
  assert.match(conv2Content, /Conversation ID: `conv_2`/);
});

test('CLI export --id produces a single Markdown file', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const outDir = path.join(tempDir, 'exported-single');
  const exportResult = await runCli(['export', '--id', 'conv_1', '--out', outDir, '--db', dbPath], { cwd: tempDir });
  assert.equal(exportResult.code, 0);
  assert.equal(exportResult.stderr, '');
  assert.match(exportResult.stdout, /1 conversation\(s\) exported to/);

  const files = fs.readdirSync(outDir);
  assert.equal(files.length, 1);
  assert.ok(files[0].includes('conv_1'));

  const content = fs.readFileSync(path.join(outDir, files[0]), 'utf8');
  assert.match(content, /# 项目恢复方案/);
});

test('CLI export uses default output directory when --out is omitted', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const defaultDir = path.join(tempDir, 'claude-history-export');
  const exportResult = await runCli(['export', '--db', dbPath], { cwd: tempDir });
  assert.equal(exportResult.code, 0);
  assert.match(exportResult.stdout, /claude-history-export/);

  assert.equal(fs.existsSync(defaultDir), true);
  const files = fs.readdirSync(defaultDir);
  assert.equal(files.length, 2);
});

test('CLI search returns matching conversations', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const searchResult = await runCli(['search', '恢复', '--db', dbPath], { cwd: tempDir });
  assert.equal(searchResult.code, 0);
  assert.equal(searchResult.stderr, '');

  const rows = JSON.parse(searchResult.stdout);
  assert.equal(rows.length, 2);
  const ids = rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ['conv_1', 'conv_2']);
});

test('CLI search returns single matching conversation', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const searchResult = await runCli(['search', '限制', '--db', dbPath], { cwd: tempDir });
  assert.equal(searchResult.code, 0);

  const rows = JSON.parse(searchResult.stdout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'conv_2');
  assert.equal(rows[0].title, '对话恢复限制');
});

test('CLI search handles no-match case with empty array', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const searchResult = await runCli(['search', 'nonexistent-query-xyz', '--db', dbPath], { cwd: tempDir });
  assert.equal(searchResult.code, 0);
  assert.equal(searchResult.stderr, '');

  const rows = JSON.parse(searchResult.stdout);
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 0);
});

test('CLI search with multi-word query', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const dbPath = path.join(tempDir, 'history.sqlite');

  const importResult = await runCli(['import', zipPath, '--db', dbPath], { cwd: tempDir });
  assert.equal(importResult.code, 0);

  const searchResult = await runCli(['search', 'Claude', '导出', '--db', dbPath], { cwd: tempDir });
  assert.equal(searchResult.code, 0);

  const rows = JSON.parse(searchResult.stdout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'conv_1');
});
