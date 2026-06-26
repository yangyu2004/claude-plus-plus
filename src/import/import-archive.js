import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readClaudeExportZip, findDocument } from './read-export-zip.js';
import { extractConversationsFromDocuments } from './normalize.js';
import {
  createImportRun,
  countProjects,
  listImportedSourceHashes,
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
  if (listImportedSourceHashes(database).includes(sourceHash)) {
    return { imported: 0, skipped: true, sourceHash };
  }

  const documents = readClaudeExportZip(zipPath);
  const conversations = extractConversationsFromDocuments(documents);
  const metadata = extractMetadata(documents);
  const projects = metadata.projectsJson || [];
  const importedAt = new Date().toISOString();

  withTransaction(database, () => {
    createImportRun(database, zipPath, sourceHash, importedAt);
    saveImportMetadata(database, sourceHash, metadata);
    saveProjects(database, projects);
    for (const conversation of conversations) {
      saveConversation(database, conversation, sourceHash);
      replaceConversationMessages(database, conversation);
    }
  });

  return { imported: conversations.length, skipped: false, sourceHash };
}

export function importArchiveFromBuffer(database, buffer, fileName = 'upload.zip') {
  const sourceHash = hashBuffer(buffer);
  if (listImportedSourceHashes(database).includes(sourceHash)) {
    return { imported: 0, skipped: true, sourceHash };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-history-rescue-'));
  const tempPath = path.join(tempDir, fileName);
  fs.writeFileSync(tempPath, buffer);

  try {
    return importArchiveFromFile(database, tempPath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
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
