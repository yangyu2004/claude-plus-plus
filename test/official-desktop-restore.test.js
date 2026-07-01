import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { applyOfficialDesktopRestorePlan, buildOfficialDesktopRestorePlan } from '../src/desktop/official-restore.js';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';

function makeFixtureZip() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-official-restore-'));
  const zipPath = path.join(tempDir, 'export.zip');
  const zip = new AdmZip();
  const fixture = fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url), 'utf8');
  zip.addFile('conversations.json', Buffer.from(fixture, 'utf8'));
  zip.writeZip(zipPath);
  return { tempDir, zipPath };
}

function setupTarget(tempDir) {
  const sessionRoot = path.join(tempDir, 'claude-code-sessions', 'account-uuid', 'org-uuid');
  fs.mkdirSync(sessionRoot, { recursive: true });
  return {
    sessionRoot,
    projectsDir: path.join(tempDir, 'projects'),
    cwd: path.join(tempDir, 'work')
  };
}

test('builds official Claude Desktop session files with clean visible content', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const target = setupTarget(tempDir);
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });

  assert.equal(plan.target.variant, 'official');
  assert.equal(plan.restoreCount, 1);
  assert.equal(plan.entries[0].sessionId.startsWith('local_'), true);
  assert.equal(plan.entries[0].exists, false);

  const result = await applyOfficialDesktopRestorePlan(plan);
  assert.equal(result.written[0].skipped, false);
  assert.equal(result.readState.reason, 'not-required');

  const metadata = JSON.parse(fs.readFileSync(plan.entries[0].metadataPath, 'utf8'));
  const rawTranscript = fs.readFileSync(plan.entries[0].transcriptPath, 'utf8');
  const transcript = rawTranscript.trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(metadata.title, '项目恢复方案');
  assert.equal(metadata.importedBy, 'claude-plus-plus-official');
  assert.equal(metadata.cliSessionId, plan.entries[0].cliSessionId);
  assert.equal(metadata.cwd, target.cwd);
  assert.equal(metadata.completedTurns, 1);

  assert.equal(transcript[0].type, 'user');
  assert.equal(transcript[0].sessionId, metadata.cliSessionId);
  assert.equal(transcript[0].message.content, '我有一份 Claude 导出，想把它重新索引起来。');
  assert.equal(transcript[1].type, 'assistant');
  assert.equal(transcript[1].message.content[0].text, '可以先导入本地 SQLite，再用本地 UI 浏览。');
  assert.equal(transcript[2].type, 'ai-title');
  assert.equal(transcript[3].type, 'last-prompt');
  assert.equal(rawTranscript.includes('内部思考'), false);
});

test('skips existing official sessions unless overwrite is enabled', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const target = setupTarget(tempDir);
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));

  const plan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });
  const first = await applyOfficialDesktopRestorePlan(plan);
  assert.equal(first.written[0].skipped, false);

  const secondPlan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });
  assert.equal(secondPlan.existingCount, 1);
  const second = await applyOfficialDesktopRestorePlan(secondPlan);
  assert.equal(second.written[0].skipped, true);

  const forcedPlan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });
  const forced = await applyOfficialDesktopRestorePlan(forcedPlan, { overwrite: true });
  assert.equal(forced.written[0].skipped, false);
});

test('backs up overwritten official metadata and transcript files', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const target = setupTarget(tempDir);
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });

  await applyOfficialDesktopRestorePlan(plan);
  fs.writeFileSync(plan.entries[0].metadataPath, '{"old":true}\n', 'utf8');
  fs.writeFileSync(plan.entries[0].transcriptPath, 'old transcript\n', 'utf8');

  const forcedPlan = buildOfficialDesktopRestorePlan(conversations, { ...target, limit: 1 });
  const backupDir = path.join(tempDir, 'backups');
  const forced = await applyOfficialDesktopRestorePlan(forcedPlan, { overwrite: true, backupDir });

  assert.equal(forced.written[0].skipped, false);
  assert.equal(fs.readFileSync(path.join(backupDir, path.basename(plan.entries[0].metadataPath)), 'utf8'), '{"old":true}\n');
  assert.equal(fs.readFileSync(path.join(backupDir, path.basename(plan.entries[0].transcriptPath)), 'utf8'), 'old transcript\n');
  assert.deepEqual(fs.readdirSync(path.dirname(plan.entries[0].transcriptPath)).filter((name) => name.includes('.tmp-')), []);
});
