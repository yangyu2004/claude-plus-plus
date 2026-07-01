import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDir } from '../core.js';

const DEFAULT_LIST_LIMIT = 100;
const MAX_MESSAGE_TEXT_LENGTH = 80000;
const MAX_TITLE_LENGTH = 2000;
const AUDIT_OFFSET_MS_ASSISTANT = 300;
const AUDIT_OFFSET_MS_RESULT = 600;
const AUDIT_OFFSET_MS_INIT = 100;
const AUDIT_OFFSET_MS_STATUS = 110;
const TRUNCATION_MARKER = '\n\n[Truncated by Claude History Rescue]';
const IMPORTED_BY = 'claude-history-rescue-web';
const DEFAULT_MODEL = 'claude-history-rescue-import';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  created_at TEXT,
  updated_at TEXT,
  project_id TEXT,
  project_name TEXT,
  source_path TEXT,
  source_hash TEXT,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT,
  message_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

CREATE TABLE IF NOT EXISTS import_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL UNIQUE,
  users_json TEXT,
  memories_json TEXT,
  projects_json TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  is_private INTEGER,
  is_starter_project INTEGER,
  creator_uuid TEXT,
  creator_name TEXT,
  docs_json TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
`;

export function openDatabase(dbPath) {
  ensureDir(path.dirname(dbPath));
  const database = new DatabaseSync(dbPath);
  database.exec(SCHEMA);
  return database;
}

export function withTransaction(database, callback) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function listImportedSourceHashes(database) {
  const statement = database.prepare('SELECT source_hash FROM import_runs ORDER BY id ASC');
  return statement.all().map((row) => row.source_hash);
}

export function createImportRun(database, sourcePath, sourceHash, importedAt) {
  const statement = database.prepare(
    'INSERT OR IGNORE INTO import_runs (source_path, source_hash, imported_at) VALUES (?, ?, ?)'
  );
  const result = statement.run(sourcePath, sourceHash, importedAt);
  return result.changes === 1;
}

export function saveConversation(database, conversation, sourceHash) {
  const statement = database.prepare(`
    INSERT INTO conversations (id, title, summary, created_at, updated_at, project_id, project_name, source_path, source_hash, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      project_id = excluded.project_id,
      project_name = excluded.project_name,
      source_path = excluded.source_path,
      source_hash = excluded.source_hash,
      raw_json = excluded.raw_json
  `);

  statement.run(
    conversation.id,
    conversation.title,
    conversation.summary || null,
    conversation.createdAt,
    conversation.updatedAt,
    conversation.projectId || null,
    conversation.projectName || null,
    conversation.sourcePath,
    sourceHash,
    JSON.stringify(conversation.raw)
  );
}

export function replaceConversationMessages(database, conversation) {
  database.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversation.id);
  const statement = database.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at, message_index, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const message of conversation.messages) {
    statement.run(
      message.id,
      conversation.id,
      message.role,
      message.content,
      message.createdAt,
      message.index,
      JSON.stringify(message.raw)
    );
  }
}

export function getConversation(database, conversationId) {
  const conversation = database.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conversation) return null;

  const messages = database.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY message_index ASC'
  ).all(conversationId);

  return {
    ...conversation,
    raw: JSON.parse(conversation.raw_json),
    messages: messages.map((message) => ({
      ...message,
      raw: JSON.parse(message.raw_json)
    }))
  };
}

export function listConversations(database, { q = '', limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  const query = String(q || '').trim();
  const escapedQuery = query.replace(/[%_]/g, '\\$&');
  const baseSql = `
    SELECT
      c.*,
      COUNT(m.id) AS message_count,
      COALESCE(MAX(m.created_at), c.updated_at, c.created_at) AS sort_at,
      COALESCE(
        (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.message_index DESC LIMIT 1),
        ''
      ) AS last_message
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    ${query ? `
      WHERE c.title LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR c.summary LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR c.raw_json LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR c.project_name LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR EXISTS (
           SELECT 1
           FROM messages mx
           WHERE mx.conversation_id = c.id
             AND mx.content LIKE ? ESCAPE '\\' COLLATE NOCASE
         )
    ` : ''}
    GROUP BY c.id
    ORDER BY datetime(sort_at) DESC, datetime(c.created_at) DESC, c.title ASC
    LIMIT ? OFFSET ?
  `;
  const statement = database.prepare(baseSql);
  const params = query ? [`%${escapedQuery}%`, `%${escapedQuery}%`, `%${escapedQuery}%`, `%${escapedQuery}%`, `%${escapedQuery}%`, limit, offset] : [limit, offset];
  const rows = statement.all(...params);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    lastMessage: row.last_message,
    projectId: row.project_id,
    projectName: row.project_name,
    sourcePath: row.source_path,
    sourceHash: row.source_hash
  }));
}

export function countConversations(database) {
  return database.prepare('SELECT COUNT(*) AS count FROM conversations').get().count;
}

export function hasConversation(database, conversationId) {
  return Boolean(database.prepare('SELECT 1 FROM conversations WHERE id = ? LIMIT 1').get(conversationId));
}

export function ensureDatabaseFileExists(dbPath) {
  ensureDir(path.dirname(dbPath));
  if (!fs.existsSync(dbPath)) {
    fs.closeSync(fs.openSync(dbPath, 'a'));
  }
}

export function saveImportMetadata(database, sourceHash, metadata) {
  const statement = database.prepare(`
    INSERT INTO import_metadata (source_hash, users_json, memories_json, projects_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_hash) DO UPDATE SET
      users_json = excluded.users_json,
      memories_json = excluded.memories_json,
      projects_json = excluded.projects_json
  `);

  statement.run(
    sourceHash,
    metadata.usersJson ? JSON.stringify(metadata.usersJson) : null,
    metadata.memoriesJson ? JSON.stringify(metadata.memoriesJson) : null,
    metadata.projectsJson ? JSON.stringify(metadata.projectsJson) : null
  );
}

export function getImportMetadata(database, sourceHash) {
  const row = database.prepare('SELECT * FROM import_metadata WHERE source_hash = ?').get(sourceHash);
  if (!row) return null;

  return {
    sourceHash: row.source_hash,
    usersJson: row.users_json ? JSON.parse(row.users_json) : null,
    memoriesJson: row.memories_json ? JSON.parse(row.memories_json) : null,
    projectsJson: row.projects_json ? JSON.parse(row.projects_json) : null
  };
}

export function saveProjects(database, projects) {
  const statement = database.prepare(`
    INSERT INTO projects (
      uuid, name, description, created_at, updated_at, is_private, is_starter_project,
      creator_uuid, creator_name, docs_json, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_private = excluded.is_private,
      is_starter_project = excluded.is_starter_project,
      creator_uuid = excluded.creator_uuid,
      creator_name = excluded.creator_name,
      docs_json = excluded.docs_json,
      raw_json = excluded.raw_json
  `);

  for (const project of projects || []) {
    statement.run(
      project.uuid,
      project.name,
      project.description || null,
      project.created_at || null,
      project.updated_at || null,
      project.is_private === undefined ? null : Number(Boolean(project.is_private)),
      project.is_starter_project === undefined ? null : Number(Boolean(project.is_starter_project)),
      project.creator?.uuid || null,
      project.creator?.full_name || null,
      JSON.stringify(project.docs || []),
      JSON.stringify(project)
    );
  }
}

export function listProjects(database) {
  return database.prepare('SELECT * FROM projects ORDER BY datetime(updated_at) DESC, name ASC').all().map((row) => ({
    uuid: row.uuid,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPrivate: row.is_private,
    isStarterProject: row.is_starter_project,
    creatorUuid: row.creator_uuid,
    creatorName: row.creator_name,
    docs: JSON.parse(row.docs_json),
    raw: JSON.parse(row.raw_json)
  }));
}

export function getProject(database, projectUuid) {
  const row = database.prepare('SELECT * FROM projects WHERE uuid = ?').get(projectUuid);
  if (!row) return null;

  return {
    uuid: row.uuid,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPrivate: row.is_private,
    isStarterProject: row.is_starter_project,
    creatorUuid: row.creator_uuid,
    creatorName: row.creator_name,
    docs: JSON.parse(row.docs_json),
    raw: JSON.parse(row.raw_json)
  };
}

export function getLatestImport(database) {
  return database.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 1').get() || null;
}

export function countProjects(database) {
  return database.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
}
