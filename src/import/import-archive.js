import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readClaudeExportZip, findDocument } from './read-export-zip.js';
import { extractConversationsFromDocuments } from './normalize.js';
import {
  createImportRun,
  countProjects,
  replaceConversationMessages,
  saveConversation,
  saveProjects,
  saveImportMetadata,
  withTransaction
} from '../db/database.js';

export function hashBuffer(buffer) {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

export function hashFile(filePath) {
  return hashBuffer(fs.readFileSync(filePath));
}

export function importArchiveFromFile(database, zipPath) {
  const sourceHash = hashFile(zipPath);
  const documents = readClaudeExportZip(zipPath);
  const conversations = extractConversationsFromDocuments(documents);
  const metadata = extractMetadata(documents);
  const projects = metadata.projectsJson || [];
  const importedAt = new Date().toISOString();

  const result = withTransaction(database, () => {
    const claimed = createImportRun(database, zipPath, sourceHash, importedAt);
    if (!claimed) {
      return { imported: 0, skipped: true, reason: 'already-imported', sourceHash };
    }

    saveImportMetadata(database, sourceHash, metadata);
    saveProjects(database, projects);
    for (const conversation of conversations) {
      saveConversation(database, conversation, sourceHash);
      replaceConversationMessages(database, conversation);
    }

    return { imported: conversations.length, skipped: false, sourceHash };
  });

  return result;
}

function safeArchiveFileName(fileName) {
  const normalized = path.basename(String(fileName || 'upload.zip').replaceAll('\\', '/'));
  const safeName = normalized.replace(/[^\p{L}\p{N}._ -]/gu, '-').trim();
  if (/^\.*$/.test(safeName)) {
    return 'upload.zip';
  }

  return safeName || 'upload.zip';
}

export function importArchiveFromBuffer(database, buffer, fileName = 'upload.zip') {
  const sourceHash = hashBuffer(buffer);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-'));
  const safeName = safeArchiveFileName(fileName);
  const randomSuffix = crypto.randomUUID().slice(0, 8);
  const tempPath = path.resolve(tempDir, `${safeName}.${randomSuffix}`);
  const relativeTempPath = path.relative(tempDir, tempPath);
  if (relativeTempPath.startsWith('..') || path.isAbsolute(relativeTempPath)) {
    throw new Error('Invalid archive file name');
  }

  fs.writeFileSync(tempPath, buffer);

  try {
    return importArchiveFromFile(database, tempPath);
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore temp cleanup failures
    }
    try {
      fs.rmdirSync(tempDir);
    } catch {
      // ignore temp cleanup failures
    }
  }
}

function extractMetadata(documents) {
  const users = findDocument(documents, 'users.json')?.json ?? null;
  const memories = findDocument(documents, 'memories.json')?.json ?? null;
  const projects = documents.filter((document) => document.path.startsWith('projects/') && document.path.endsWith('.json')).map((document) => document.json);

  return {
    usersJson: users,
    memoriesJson: memories,
    projectsJson: projects.length > 0 ? projects : null
  };
}
