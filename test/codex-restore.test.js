import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { applyCodexRestorePlan, buildCodexRestorePlan } from '../src/codex/restore.js';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';

function makeFixtureZip() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-codex-restore-'));
  const zipPath = path.join(tempDir, 'export.zip');
  const zip = new AdmZip();
  const fixture = fs.readFileSync(new URL('./fixtures/sample-export.json', import.meta.url), 'utf8');
  zip.addFile('conversations.json', Buffer.from(fixture, 'utf8'));
  zip.writeZip(zipPath);
  return { tempDir, zipPath };
}

function createCodexStateDb(codexHome) {
  fs.mkdirSync(codexHome, { recursive: true });
  const stateDbPath = path.join(codexHome, 'state_5.sqlite');
  const database = new DatabaseSync(stateDbPath);
  database.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT,
      cli_version TEXT NOT NULL DEFAULT '',
      first_user_message TEXT NOT NULL DEFAULT '',
      agent_nickname TEXT,
      agent_role TEXT,
      memory_mode TEXT NOT NULL DEFAULT 'enabled',
      model TEXT,
      reasoning_effort TEXT,
      agent_path TEXT,
      created_at_ms INTEGER,
      updated_at_ms INTEGER,
      thread_source TEXT,
      preview TEXT NOT NULL DEFAULT '',
      recency_at INTEGER NOT NULL DEFAULT 0,
      recency_at_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
  database.close();
  return stateDbPath;
}

test('restores Claude export conversations into Codex rollout files and thread index', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const codexHome = path.join(tempDir, '.codex');
  createCodexStateDb(codexHome);
  const cwd = path.join(tempDir, 'workspace');
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));
  const plan = buildCodexRestorePlan(conversations, { codexHome, cwd, limit: 1 });

  assert.equal(plan.target.variant, 'codex');
  assert.equal(plan.restoreCount, 1);
  assert.equal(plan.existingCount, 0);
  assert.match(plan.entries[0].rolloutPath, /rollout-2025-06-01T08-00-00-/);

  const result = await applyCodexRestorePlan(plan);
  assert.equal(result.written[0].skipped, false);
  assert.equal(result.indexed[0].skipped, false);
  assert.equal(fs.existsSync(result.backupDir), true);

  const rawRollout = fs.readFileSync(plan.entries[0].rolloutPath, 'utf8');
  const rollout = rawRollout.trim().split('\n').map((line) => JSON.parse(line));
  const visibleMessages = rollout
    .filter((line) => line.type === 'response_item' && line.payload.type === 'message')
    .map((line) => line.payload);

  assert.equal(rollout[0].type, 'session_meta');
  assert.equal(rollout[0].payload.session_id, plan.entries[0].threadId);
  assert.equal(visibleMessages[0].role, 'user');
  assert.equal(visibleMessages[0].content[0].text, '我有一份 Claude 导出，想把它重新索引起来。');
  assert.equal(visibleMessages[1].role, 'assistant');
  assert.equal(visibleMessages[1].content[0].text, '可以先导入本地 SQLite，再用本地 UI 浏览。');
  assert.equal(rawRollout.includes('内部思考'), false);

  const database = new DatabaseSync(path.join(codexHome, 'state_5.sqlite'));
  const row = database.prepare('SELECT id, title, rollout_path, preview, source, model_provider FROM threads WHERE id = ?').get(plan.entries[0].threadId);
  database.close();

  assert.equal(row.id, plan.entries[0].threadId);
  assert.equal(row.title, '项目恢复方案');
  assert.equal(row.rollout_path, plan.entries[0].rolloutPath);
  assert.equal(row.preview, '我有一份 Claude 导出，想把它重新索引起来。');
  assert.equal(row.source, 'vscode');
  assert.equal(row.model_provider, 'custom');

  const sessionIndex = fs.readFileSync(path.join(codexHome, 'session_index.jsonl'), 'utf8');
  assert.match(sessionIndex, new RegExp(plan.entries[0].threadId));
});

test('skips existing Codex restore entries unless overwrite is enabled', async () => {
  const { tempDir, zipPath } = makeFixtureZip();
  const codexHome = path.join(tempDir, '.codex');
  createCodexStateDb(codexHome);
  const conversations = extractConversationsFromDocuments(readClaudeExportZip(zipPath));

  const plan = buildCodexRestorePlan(conversations, { codexHome, cwd: tempDir, limit: 1 });
  const first = await applyCodexRestorePlan(plan);
  assert.equal(first.written[0].skipped, false);
  assert.equal(first.indexed[0].skipped, false);

  const secondPlan = buildCodexRestorePlan(conversations, { codexHome, cwd: tempDir, limit: 1 });
  assert.equal(secondPlan.existingCount, 1);
  const second = await applyCodexRestorePlan(secondPlan);
  assert.equal(second.written[0].skipped, true);
  assert.equal(second.indexed[0].skipped, true);

  const forcedPlan = buildCodexRestorePlan(conversations, { codexHome, cwd: tempDir, limit: 1 });
  const forced = await applyCodexRestorePlan(forcedPlan, { overwrite: true });
  assert.equal(forced.written[0].skipped, false);
  assert.equal(forced.indexed[0].skipped, false);
});
