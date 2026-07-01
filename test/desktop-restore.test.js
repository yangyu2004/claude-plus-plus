import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { applyDesktopRestorePlan, buildDesktopRestorePlan } from '../src/desktop/restore.js';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';

function makeFixtureZip() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-desktop-restore-'));
  const zipPath = path.join(tempDir, 'export.zip');
  const zip = new AdmZip();
  const fixture = fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url), 'utf8');
  zip.addFile('conversations.json', Buffer.from(fixture, 'utf8'));
  zip.writeZip(zipPath);
  return { tempDir, zipPath };
}

test('builds Claude Desktop local session files from exported conversations', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const sessionRoot = path.join(
    tempDir,
    'local-agent-mode-sessions',
    'account-uuid',
    'org-uuid'
  );
  fs.mkdirSync(sessionRoot, { recursive: true });

  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildDesktopRestorePlan(conversations, {
    sessionRoot,
    limit: 1,
    emailAddress: 'test@example.com'
  });

  assert.equal(plan.restoreCount, 1);
  assert.equal(plan.entries[0].sessionId.startsWith('local_'), true);
  assert.equal(plan.entries[0].exists, false);

  const result = await applyDesktopRestorePlan(plan);
  assert.equal(result.written.length, 1);
  assert.equal(result.written[0].skipped, false);
  assert.equal(result.readState.reason, 'not-requested');

  const metadata = JSON.parse(fs.readFileSync(plan.entries[0].metadataPath, 'utf8'));
  const audit = fs.readFileSync(plan.entries[0].auditPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const transcript = fs.readFileSync(plan.entries[0].transcriptPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const transcriptAlias = fs.readFileSync(plan.entries[0].transcriptAliasPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const claudeConfig = JSON.parse(fs.readFileSync(plan.entries[0].claudeConfigPath, 'utf8'));

  assert.equal(metadata.title, '项目恢复方案');
  assert.equal(metadata.isArchived, false);
  assert.equal(metadata.importedBy, 'claude-history-rescue-web');
  assert.equal(claudeConfig.oauthAccount.emailAddress, 'test@example.com');
  assert.equal(audit.length, 6);
  assert.equal(audit[0].type, 'user');
  assert.equal(audit[0].session_id, plan.entries[0].sessionUuid);
  assert.equal(audit[1].type, 'system');
  assert.equal(audit[1].subtype, 'init');
  assert.equal(audit[1].session_id, metadata.cliSessionId);
  assert.equal(audit[2].type, 'system');
  assert.equal(audit[2].subtype, 'status');
  assert.equal(audit[3].type, 'user');
  assert.equal(audit[3].isReplay, true);
  assert.equal(audit[3].session_id, metadata.cliSessionId);
  assert.equal(audit[4].type, 'assistant');
  assert.equal(audit[4].message.type, 'message');
  assert.deepEqual(audit[4].message.content, [
    {
      type: 'text',
      text: '可以先导入本地 SQLite，再用本地 UI 浏览。'
    }
  ]);
  assert.equal(audit[5].type, 'result');
  assert.equal(audit[5].subtype, 'success');
  assert.equal(audit[5].result, '可以先导入本地 SQLite，再用本地 UI 浏览。');
  assert.equal(transcript[0].type, 'user');
  assert.equal(transcript[0].sessionId, metadata.cliSessionId);
  assert.equal(transcript[1].type, 'assistant');
  assert.equal(transcript[1].message.content[0].text, '可以先导入本地 SQLite，再用本地 UI 浏览。');
  assert.equal(transcript[2].type, 'last-prompt');
  assert.equal(transcriptAlias[0].sessionId, plan.entries[0].sessionUuid);
});

test('skips existing desktop sessions unless overwrite is enabled', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const sessionRoot = path.join(tempDir, 'local-agent-mode-sessions', 'account-uuid', 'org-uuid');
  fs.mkdirSync(sessionRoot, { recursive: true });
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildDesktopRestorePlan(conversations, { sessionRoot, limit: 1 });

  const first = await applyDesktopRestorePlan(plan);
  assert.equal(first.written[0].skipped, false);

  const secondPlan = buildDesktopRestorePlan(conversations, { sessionRoot, limit: 1 });
  assert.equal(secondPlan.existingCount, 1);
  const second = await applyDesktopRestorePlan(secondPlan);
  assert.equal(second.written[0].skipped, true);
});

test('backs up overwritten desktop restore files', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const sessionRoot = path.join(tempDir, 'local-agent-mode-sessions', 'account-uuid', 'org-uuid');
  fs.mkdirSync(sessionRoot, { recursive: true });
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildDesktopRestorePlan(conversations, { sessionRoot, limit: 1 });

  await applyDesktopRestorePlan(plan);
  fs.writeFileSync(plan.entries[0].metadataPath, '{"old":"metadata"}\n', 'utf8');
  fs.writeFileSync(plan.entries[0].claudeConfigPath, '{"old":"config"}\n', 'utf8');
  fs.writeFileSync(plan.entries[0].auditPath, 'old audit\n', 'utf8');
  fs.writeFileSync(plan.entries[0].transcriptPath, 'old transcript\n', 'utf8');
  fs.writeFileSync(plan.entries[0].transcriptAliasPath, 'old alias\n', 'utf8');

  const forcedPlan = buildDesktopRestorePlan(conversations, { sessionRoot, limit: 1 });
  const backupDir = path.join(tempDir, 'backups');
  const forced = await applyDesktopRestorePlan(forcedPlan, { overwrite: true, backupDir });
  const backups = forced.written[0].backups.map((backupPath) => fs.readFileSync(backupPath, 'utf8'));

  assert.equal(forced.written[0].skipped, false);
  assert.equal(backups.includes('{"old":"metadata"}\n'), true);
  assert.equal(backups.includes('{"old":"config"}\n'), true);
  assert.equal(backups.includes('old audit\n'), true);
  assert.equal(backups.includes('old transcript\n'), true);
  assert.equal(backups.includes('old alias\n'), true);
  assert.deepEqual(fs.readdirSync(path.dirname(plan.entries[0].transcriptPath)).filter((name) => name.includes('.tmp-')), []);
});
