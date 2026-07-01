import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDir } from '../core.js';

const CODEX_CLI_VERSION = 'claude-plus-plus';
const CODEX_MODEL = 'imported-claude-export';
const MAX_MESSAGE_TEXT_LENGTH = 80000;
const MAX_TITLE_LENGTH = 2000;
const MAX_PREVIEW_LENGTH = 500;

function defaultCodexHome() {
  return path.join(os.homedir(), '.codex');
}

function uuidFromHash(seed) {
  const hex = crypto.createHash('sha256').update(String(seed)).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join('-');
}

function toMillis(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toIso(value, fallbackMs) {
  return new Date(toMillis(value, fallbackMs)).toISOString();
}

function shortText(value, maxLength = MAX_MESSAGE_TEXT_LENGTH) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[Truncated by Claude++]`;
}

function firstUserMessage(conversation) {
  return conversation.messages.find((message) => message.role === 'user' && visibleText(message))
    || conversation.messages.find((message) => visibleText(message))
    || null;
}

function visibleText(message) {
  const rawContent = message?.raw?.content;
  const attachments = attachmentText(message?.raw);
  if (Array.isArray(rawContent)) {
    const text = rawContent
      .filter((block) => block && typeof block === 'object' && block.type === 'text')
      .map((block) => String(block.text || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return [text, attachments].filter(Boolean).join('\n\n').trim();
  }

  if (typeof rawContent === 'string') return [rawContent.trim(), attachments].filter(Boolean).join('\n\n').trim();
  return [String(message?.content || '').trim(), attachments].filter(Boolean).join('\n\n').trim();
}

function attachmentText(rawMessage) {
  const attachmentLines = (rawMessage?.attachments || [])
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object') return '';
      const fileName = attachment.file_name || attachment.name || '';
      const extractedContent = String(attachment.extracted_content || attachment.summary || attachment.content || '').trim();
      if (extractedContent) return fileName ? `[Attachment: ${fileName}]\n${extractedContent}` : extractedContent;
      return fileName ? `[Attachment: ${fileName}]` : '';
    })
    .filter(Boolean);
  const fileLines = (rawMessage?.files || [])
    .map((file) => file && typeof file === 'object' && file.file_name ? `[File: ${file.file_name}]` : '')
    .filter(Boolean);

  return [...attachmentLines, ...fileLines].join('\n\n').trim();
}

function renderableMessages(conversation) {
  return (conversation.messages || [])
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: shortText(visibleText(message)),
      createdAt: message.createdAt,
      id: message.id
    }))
    .filter((message) => message.text);
}

function hasContent(conversation) {
  return renderableMessages(conversation).length > 0;
}

function pathDateParts(timestampMs) {
  const date = new Date(timestampMs);
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ];
}

function rolloutTimestamp(timestampMs) {
  return new Date(timestampMs)
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replaceAll(':', '-');
}

function buildResponseMessagePayload(message, responseId) {
  if (message.role === 'assistant') {
    return {
      type: 'message',
      id: responseId,
      role: 'assistant',
      content: [{ type: 'output_text', text: message.text }],
      phase: 'final_answer'
    };
  }

  return {
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: message.text }]
  };
}

function buildCodexJsonl(conversation, threadId, target) {
  const baseMs = toMillis(conversation.createdAt || conversation.updatedAt, Date.now());
  const messages = renderableMessages(conversation);
  const lines = [];
  let lastTurnId = uuidFromHash(`${threadId}:turn:0`);

  lines.push(JSON.stringify({
    timestamp: toIso(conversation.createdAt, baseMs),
    type: 'session_meta',
    payload: {
      session_id: threadId,
      id: threadId,
      timestamp: toIso(conversation.createdAt, baseMs),
      cwd: target.cwd,
      originator: 'Codex Desktop',
      cli_version: CODEX_CLI_VERSION,
      source: 'vscode',
      thread_source: 'user',
      model_provider: 'custom'
    }
  }));

  messages.forEach((message, index) => {
    const timestampMs = toMillis(message.createdAt, baseMs + index * 1000);
    const timestamp = toIso(message.createdAt, timestampMs);
    if (message.role === 'user') {
      lastTurnId = uuidFromHash(`${threadId}:turn:${index}:${message.id}`);
      lines.push(JSON.stringify({
        timestamp,
        type: 'event_msg',
        payload: {
          type: 'task_started',
          turn_id: lastTurnId,
          started_at: Math.floor(timestampMs / 1000),
          model_context_window: 0,
          collaboration_mode_kind: 'default'
        }
      }));
      lines.push(JSON.stringify({
        timestamp,
        type: 'turn_context',
        payload: {
          turn_id: lastTurnId,
          cwd: target.cwd,
          workspace_roots: [target.cwd],
          current_date: new Date(timestampMs).toISOString().slice(0, 10),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          approval_policy: 'never',
          sandbox_policy: { type: 'disabled' },
          model: CODEX_MODEL,
          effort: 'high',
          summary: 'imported'
        }
      }));
      lines.push(JSON.stringify({
        timestamp,
        type: 'response_item',
        payload: buildResponseMessagePayload(message)
      }));
      lines.push(JSON.stringify({
        timestamp,
        type: 'event_msg',
        payload: {
          type: 'user_message',
          client_id: uuidFromHash(`${threadId}:client:${index}`),
          message: message.text,
          images: [],
          local_images: [],
          text_elements: []
        }
      }));
      return;
    }

    const responseId = `msg_${crypto.createHash('sha256').update(`${threadId}:assistant:${index}`).digest('hex').slice(0, 42)}`;
    lines.push(JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: {
        type: 'agent_message',
        message: message.text,
        phase: 'final_answer',
        memory_citation: null
      }
    }));
    lines.push(JSON.stringify({
      timestamp,
      type: 'response_item',
      payload: buildResponseMessagePayload(message, responseId)
    }));
    lines.push(JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        turn_id: lastTurnId,
        last_agent_message: message.text,
        completed_at: Math.floor(timestampMs / 1000),
        duration_ms: 0,
        time_to_first_token_ms: 0
      }
    }));
  });

  return `${lines.join('\n')}\n`;
}

export function resolveCodexTarget(options = {}) {
  const codexHome = path.resolve(options.codexHome || defaultCodexHome());
  return {
    variant: 'codex',
    codexHome,
    stateDbPath: path.resolve(options.stateDbPath || path.join(codexHome, 'state_5.sqlite')),
    sessionsDir: path.resolve(options.sessionsDir || path.join(codexHome, 'sessions')),
    sessionIndexPath: path.resolve(options.sessionIndexPath || path.join(codexHome, 'session_index.jsonl')),
    cwd: path.resolve(options.cwd || process.cwd())
  };
}

function buildRestoreEntry(conversation, target) {
  const threadId = uuidFromHash(`codex-restore:thread:${conversation.id}`);
  const createdMs = toMillis(conversation.createdAt || conversation.updatedAt, Date.now());
  const updatedMs = toMillis(conversation.updatedAt || conversation.createdAt, createdMs);
  const [year, month, day] = pathDateParts(createdMs);
  const rolloutPath = path.join(
    target.sessionsDir,
    year,
    month,
    day,
    `rollout-${rolloutTimestamp(createdMs)}-${threadId}.jsonl`
  );
  const firstMessage = firstUserMessage(conversation);
  const firstUserText = shortText(visibleText(firstMessage), MAX_TITLE_LENGTH);
  const title = shortText(conversation.title || firstUserText || 'Imported Claude conversation', MAX_PREVIEW_LENGTH);

  return {
    conversationId: conversation.id,
    threadId,
    title,
    firstUserText,
    preview: firstUserText || title,
    createdAt: Math.floor(createdMs / 1000),
    updatedAt: Math.floor(updatedMs / 1000),
    createdAtMs: createdMs,
    updatedAtMs: updatedMs,
    rolloutPath,
    rolloutDir: path.dirname(rolloutPath),
    rolloutJsonl: buildCodexJsonl(conversation, threadId, target),
    exists: fs.existsSync(rolloutPath)
  };
}

export function buildCodexRestorePlan(conversations, options = {}) {
  const target = resolveCodexTarget(options);
  const withContent = conversations.filter(hasContent);
  const limitedConversations = withContent.slice(0, Number(options.limit || withContent.length));
  const entries = limitedConversations.map((conversation) => buildRestoreEntry(conversation, target));

  return {
    target,
    entries,
    totalConversations: conversations.length,
    skippedEmpty: conversations.length - withContent.length,
    restoreCount: entries.length,
    existingCount: entries.filter((entry) => entry.exists).length
  };
}

function backupFileIfExists(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return null;
  ensureDir(backupDir);
  const backupPath = path.join(backupDir, path.basename(filePath));
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function backupCodexState(target, backupDir) {
  const files = [
    target.stateDbPath,
    `${target.stateDbPath}-wal`,
    `${target.stateDbPath}-shm`,
    target.sessionIndexPath
  ];

  return files
    .map((filePath) => backupFileIfExists(filePath, backupDir))
    .filter(Boolean);
}

function writeRollout(entry, overwrite) {
  if (entry.exists && !overwrite) {
    return {
      threadId: entry.threadId,
      title: entry.title,
      skipped: true,
      reason: 'exists'
    };
  }

  ensureDir(entry.rolloutDir);
  writeFileAtomic(entry.rolloutPath, entry.rolloutJsonl);
  return {
    threadId: entry.threadId,
    title: entry.title,
    skipped: false,
    rolloutPath: entry.rolloutPath
  };
}

function writeFileAtomic(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`
  );
  try {
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    } catch {
      // ignore cleanup errors so the original error is preserved
    }
    throw error;
  }
}

function ensureThreadsTable(database, stateDbPath) {
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'threads'").get();
  if (!row) {
    throw new Error(`Codex state database has no threads table: ${stateDbPath}`);
  }
}

function upsertThread(database, target, entry, overwrite) {
  const existing = database.prepare('SELECT id FROM threads WHERE id = ? LIMIT 1').get(entry.threadId);
  if (existing && !overwrite) {
    return {
      threadId: entry.threadId,
      title: entry.title,
      skipped: true,
      reason: 'exists'
    };
  }

  database.prepare(`
    INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
      sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
      git_sha, git_branch, git_origin_url, cli_version, first_user_message, agent_nickname,
      agent_role, memory_mode, model, reasoning_effort, agent_path, created_at_ms,
      updated_at_ms, thread_source, preview, recency_at, recency_at_ms
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      rollout_path = excluded.rollout_path,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      cwd = excluded.cwd,
      title = excluded.title,
      first_user_message = excluded.first_user_message,
      preview = excluded.preview,
      created_at_ms = excluded.created_at_ms,
      updated_at_ms = excluded.updated_at_ms,
      recency_at = excluded.recency_at,
      recency_at_ms = excluded.recency_at_ms
  `).run(
    entry.threadId,
    entry.rolloutPath,
    entry.createdAt,
    entry.updatedAt,
    'vscode',
    'custom',
    target.cwd,
    entry.title,
    JSON.stringify({ type: 'disabled' }),
    'never',
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    CODEX_CLI_VERSION,
    entry.firstUserText,
    null,
    null,
    'enabled',
    CODEX_MODEL,
    'high',
    null,
    entry.createdAtMs,
    entry.updatedAtMs,
    'user',
    entry.preview,
    entry.updatedAt,
    entry.updatedAtMs
  );

  return {
    threadId: entry.threadId,
    title: entry.title,
    skipped: false
  };
}

function upsertSessionIndex(target, entries, overwrite) {
  const existingLines = fs.existsSync(target.sessionIndexPath)
    ? fs.readFileSync(target.sessionIndexPath, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  const existingIds = new Set(existingLines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed.id ? [parsed.id] : [];
    } catch {
      return [];
    }
  }));
  const keptLines = overwrite
    ? existingLines.filter((line) => {
      try {
        return !entries.some((entry) => JSON.parse(line).id === entry.threadId);
      } catch {
        return true;
      }
    })
    : existingLines;
  const newLines = entries
    .filter((entry) => overwrite || !existingIds.has(entry.threadId))
    .map((entry) => JSON.stringify({
      id: entry.threadId,
      thread_name: entry.title,
      updated_at: new Date(entry.updatedAtMs).toISOString(),
      imported_by: 'claude-plus-plus'
    }));

  ensureDir(path.dirname(target.sessionIndexPath));
  writeFileAtomic(target.sessionIndexPath, [...keptLines, ...newLines].join('\n') + '\n');
}

function cleanupNewRollouts(written) {
  for (const item of written) {
    if (item.skipped || !item.created || !item.rolloutPath) continue;
    fs.rmSync(item.rolloutPath, { force: true });
  }
}

export async function applyCodexRestorePlan(plan, options = {}) {
  const overwrite = Boolean(options.overwrite);
  const backupDir = options.backupDir
    ? path.resolve(options.backupDir)
    : path.join(plan.target.codexHome, '.claude-plus-plus-backups', `codex-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const backups = backupCodexState(plan.target, backupDir);
  const written = [];
  const database = new DatabaseSync(plan.target.stateDbPath);
  let transactionStarted = false;

  try {
    ensureThreadsTable(database, plan.target.stateDbPath);
    database.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    const indexed = plan.entries.map((entry) => upsertThread(database, plan.target, entry, overwrite));
    for (const [index, entry] of plan.entries.entries()) {
      if (indexed[index]?.skipped && !overwrite) {
        written.push({
          threadId: entry.threadId,
          title: entry.title,
          skipped: true,
          reason: indexed[index].reason || 'exists'
        });
        continue;
      }
      const created = !fs.existsSync(entry.rolloutPath);
      const rolloutBackup = overwrite ? backupFileIfExists(entry.rolloutPath, backupDir) : null;
      if (rolloutBackup) backups.push(rolloutBackup);
      const result = writeRollout(entry, overwrite);
      written.push({
        ...result,
        created
      });
    }
    upsertSessionIndex(plan.target, plan.entries, overwrite);
    database.exec('COMMIT');
    transactionStarted = false;

    return {
      target: plan.target,
      backupDir,
      backups,
      written,
      indexed
    };
  } catch (error) {
    if (transactionStarted) database.exec('ROLLBACK');
    cleanupNewRollouts(written);
    throw error;
  } finally {
    database.close();
  }
}
