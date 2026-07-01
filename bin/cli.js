#!/usr/bin/env node
import path from 'node:path';
import { ensureDir, resolveDatabasePath, writeTextFile, humanFileName } from '../src/core.js';
import { readClaudeExportZip } from '../src/import/read-export-zip.js';
import { extractConversationsFromDocuments } from '../src/import/normalize.js';
import { importArchiveFromFile } from '../src/import/import-archive.js';
import {
  openDatabase,
  listConversations,
  getConversation,
  countConversations
} from '../src/db/database.js';
import { conversationToMarkdown } from '../src/render/markdown.js';
import { buildResumePrompt } from '../src/rehydrate/build-summary-prompt.js';
import { createAppServer } from '../src/app/server.js';
import { applyDesktopRestorePlan, buildDesktopRestorePlan } from '../src/desktop/restore.js';
import { applyOfficialDesktopRestorePlan, buildOfficialDesktopRestorePlan } from '../src/desktop/official-restore.js';
import { applyCodexRestorePlan, buildCodexRestorePlan } from '../src/codex/restore.js';

const PRIMARY_BIN = 'claude-plus-plus';
const LEGACY_BIN = 'claude-history-rescue-web';

function printUsage() {
  process.stdout.write(`${PRIMARY_BIN}

Alias:
  ${LEGACY_BIN}

Usage:
  ${PRIMARY_BIN} import <export.zip> [--db <path>]
  ${PRIMARY_BIN} list [--db <path>] [--q <query>]
  ${PRIMARY_BIN} search <query> [--db <path>]
  ${PRIMARY_BIN} export [--id <conversationId>] [--out <dir>] [--db <path>]
  ${PRIMARY_BIN} serve [--db <path>] [--port <port>]
    (Set CLAUDE_PLUS_PLUS_IMPORT_TOKEN to require x-import-token header for /import)
  ${PRIMARY_BIN} rehydrate --id <conversationId> [--db <path>] [--out <file>]
  ${PRIMARY_BIN} desktop-restore <export.zip> [--write] [--limit <n>] [--data-dir <dir>] [--session-root <dir>] [--update-read-state]
  ${PRIMARY_BIN} desktop-restore-3p <export.zip> [--write] [--limit <n>] [--data-dir <dir>] [--session-root <dir>] [--update-read-state]
  ${PRIMARY_BIN} desktop-restore-official <export.zip> [--write] [--limit <n>] [--cwd <dir>] [--data-dir <dir>] [--projects-dir <dir>] [--session-root <dir>] [--overwrite]
  ${PRIMARY_BIN} codex-restore <export.zip> [--write] [--limit <n>] [--codex-home <dir>] [--cwd <dir>] [--overwrite]
`);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { positionals, options };
}

function printConversationTable(conversations) {
  const rows = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messageCount,
    updatedAt: conversation.updatedAt || ''
  }));
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsHelp = argv.includes('--help') || argv.includes('-h');
  const command = argv[0];
  const { positionals, options } = parseArgs(argv.slice(1));
  const baseDir = process.cwd();
  const dbPath = resolveDatabasePath(baseDir, options.db);

  if (!command || command === 'help' || wantsHelp || options.help) {
    printUsage();
    return;
  }

  if (command === 'import') {
    const zipPath = positionals[0];
    if (!zipPath) throw new Error('Missing export zip path');
    const database = openDatabase(dbPath);
    const result = importArchiveFromFile(database, path.resolve(baseDir, zipPath));
    process.stdout.write(JSON.stringify({
      ...result,
      dbPath,
      count: countConversations(database)
    }, null, 2) + '\n');
    return;
  }

  if (command === 'list') {
    const database = openDatabase(dbPath);
    const conversations = listConversations(database, { q: options.q || '', limit: 500, offset: 0 });
    printConversationTable(conversations);
    return;
  }

  if (command === 'search') {
    const query = positionals.join(' ');
    const database = openDatabase(dbPath);
    const conversations = listConversations(database, { q: query, limit: 100, offset: 0 });
    printConversationTable(conversations);
    return;
  }

  if (command === 'export') {
    const database = openDatabase(dbPath);
    const outDir = path.resolve(baseDir, options.out || './claude-history-export');
    ensureDir(outDir);
    const id = options.id || '';
    const conversations = id
      ? [getConversation(database, id)].filter(Boolean)
      : listConversations(database, { limit: 10000, offset: 0 }).map((conversation) => getConversation(database, conversation.id));

    for (const conversation of conversations) {
      const fileName = `${humanFileName(conversation.title, conversation.id)}.md`;
      writeTextFile(path.join(outDir, fileName), conversationToMarkdown(conversation));
    }

    process.stdout.write(`${conversations.length} conversation(s) exported to ${outDir}\n`);
    return;
  }

  if (command === 'rehydrate') {
    const conversationId = options.id || positionals[0];
    if (!conversationId) throw new Error('Missing conversation id');
    const database = openDatabase(dbPath);
    const conversation = getConversation(database, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const output = buildResumePrompt(conversation);
    if (options.out) {
      writeTextFile(path.resolve(baseDir, options.out), output);
    } else {
      process.stdout.write(`${output}\n`);
    }
    return;
  }

  if (command === 'desktop-restore' || command === 'desktop-restore-3p') {
    const zipPath = positionals[0];
    if (!zipPath) throw new Error('Missing export zip path');

    const documents = readClaudeExportZip(path.resolve(baseDir, zipPath));
    const conversations = extractConversationsFromDocuments(documents);
    const limit = options.limit ? Number(options.limit) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error('--limit must be a positive number');
    }

    const plan = buildDesktopRestorePlan(conversations, {
      dataDir: options['data-dir'],
      sessionRoot: options['session-root'],
      limit,
      accountName: options['account-name'],
      emailAddress: options.email
    });

    if (!options.write) {
      process.stdout.write(JSON.stringify({
        dryRun: true,
        hint: 'Add --write to create Claude Desktop local session files. Quit Claude and add --update-read-state if new items do not appear in the sidebar.',
        target: plan.target,
        totalConversations: plan.totalConversations,
        restoreCount: plan.restoreCount,
        existingCount: plan.existingCount,
        firstEntries: plan.entries.slice(0, 5).map((entry) => ({
          sessionId: entry.sessionId,
          title: entry.title,
          metadataPath: entry.metadataPath,
          exists: entry.exists
        }))
      }, null, 2) + '\n');
      return;
    }

    const result = await applyDesktopRestorePlan(plan, {
      overwrite: Boolean(options.overwrite),
      updateReadState: Boolean(options['update-read-state']),
      backupDir: options['backup-dir'] ? path.resolve(baseDir, options['backup-dir']) : undefined
    });

    process.stdout.write(JSON.stringify({
      dryRun: false,
      target: result.target,
      backupDir: result.backupDir,
      written: result.written,
      readState: result.readState
    }, null, 2) + '\n');
    return;
  }

  if (command === 'desktop-restore-official') {
    const zipPath = positionals[0];
    if (!zipPath) throw new Error('Missing export zip path');

    const documents = readClaudeExportZip(path.resolve(baseDir, zipPath));
    const conversations = extractConversationsFromDocuments(documents);
    const limit = options.limit ? Number(options.limit) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error('--limit must be a positive number');
    }

    const plan = buildOfficialDesktopRestorePlan(conversations, {
      cwd: options.cwd ? path.resolve(baseDir, options.cwd) : undefined,
      dataDir: options['data-dir'],
      projectsDir: options['projects-dir'],
      sessionRoot: options['session-root'],
      limit
    });

    if (!options.write) {
      process.stdout.write(JSON.stringify({
        dryRun: true,
        hint: 'Add --write to create official Claude Desktop local session files, then fully quit and reopen Claude Desktop so the sidebar rescans.',
        target: plan.target,
        totalConversations: plan.totalConversations,
        skippedEmpty: plan.skippedEmpty,
        restoreCount: plan.restoreCount,
        existingCount: plan.existingCount,
        firstEntries: plan.entries.slice(0, 5).map((entry) => ({
          sessionId: entry.sessionId,
          cliSessionId: entry.cliSessionId,
          title: entry.title,
          metadataPath: entry.metadataPath,
          transcriptPath: entry.transcriptPath,
          exists: entry.exists
        }))
      }, null, 2) + '\n');
      return;
    }

    const result = await applyOfficialDesktopRestorePlan(plan, {
      overwrite: Boolean(options.overwrite)
    });

    process.stdout.write(JSON.stringify({
      dryRun: false,
      target: result.target,
      restoreCount: plan.restoreCount,
      skippedEmpty: plan.skippedEmpty,
      written: result.written,
      readState: result.readState
    }, null, 2) + '\n');
    return;
  }

  if (command === 'codex-restore') {
    const zipPath = positionals[0];
    if (!zipPath) throw new Error('Missing export zip path');

    const documents = readClaudeExportZip(path.resolve(baseDir, zipPath));
    const conversations = extractConversationsFromDocuments(documents);
    const limit = options.limit ? Number(options.limit) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error('--limit must be a positive number');
    }

    const plan = buildCodexRestorePlan(conversations, {
      codexHome: options['codex-home'],
      cwd: options.cwd ? path.resolve(baseDir, options.cwd) : undefined,
      stateDbPath: options['state-db'],
      sessionsDir: options['sessions-dir'],
      sessionIndexPath: options['session-index'],
      limit
    });

    if (!options.write) {
      process.stdout.write(JSON.stringify({
        dryRun: true,
        hint: 'Add --write after quitting Codex Desktop to create Codex rollout files and sidebar thread rows.',
        target: plan.target,
        totalConversations: plan.totalConversations,
        skippedEmpty: plan.skippedEmpty,
        restoreCount: plan.restoreCount,
        existingCount: plan.existingCount,
        firstEntries: plan.entries.slice(0, 5).map((entry) => ({
          threadId: entry.threadId,
          title: entry.title,
          rolloutPath: entry.rolloutPath,
          exists: entry.exists
        }))
      }, null, 2) + '\n');
      return;
    }

    const result = await applyCodexRestorePlan(plan, {
      overwrite: Boolean(options.overwrite),
      backupDir: options['backup-dir'] ? path.resolve(baseDir, options['backup-dir']) : undefined
    });

    process.stdout.write(JSON.stringify({
      dryRun: false,
      target: result.target,
      backupDir: result.backupDir,
      restoreCount: plan.restoreCount,
      skippedEmpty: plan.skippedEmpty,
      written: result.written,
      indexed: result.indexed
    }, null, 2) + '\n');
    return;
  }

  if (command === 'serve') {
    const database = openDatabase(dbPath);
    const port = Number(options.port || 8787);
    const app = createAppServer({ database, port });
    const address = await app.listen();
    const boundHost = typeof address === 'object' && address.address ? address.address : '127.0.0.1';
    const displayHost = boundHost === '::' ? '[::]' : boundHost;
    const url = `http://${displayHost}:${address.port}`;
    process.stdout.write(`Serving on ${url}\n`);
    process.on('SIGINT', async () => {
      await app.close();
      process.exit(0);
    });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
