import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Level } from 'level';
import { ensureDir, readJsonSafe } from '../core.js';

const DEFAULT_MODEL = 'claude-history-rescue-import';
const LOCAL_STORAGE_READ_STATE_KEY = 'cowork-read-state';

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function uuidFromHash(value) {
  const hex = crypto.createHash('sha256').update(String(value || crypto.randomUUID())).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${(Number.parseInt(hex.slice(16, 17), 16) & 0x3 | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join('-');
}

function sessionUuidForConversation(conversation) {
  return isUuid(conversation.id) ? conversation.id : uuidFromHash(`claude-export:${conversation.id}`);
}

function toMillis(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toIso(value, fallback = Date.now()) {
  return new Date(toMillis(value, fallback)).toISOString();
}

function shortenText(value, maxLength = 5000) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[Truncated by Claude History Rescue]` : text;
}

function firstUserMessage(conversation) {
  return conversation.messages.find((message) => message.role === 'user' && message.content)
    || conversation.messages.find((message) => message.content)
    || null;
}

function messageUuid(sessionUuid, message, index, salt = 'message') {
  return isUuid(message?.id) ? message.id : uuidFromHash(`${sessionUuid}:${salt}:${message?.id}:${index}`);
}

function auditTimestamp(conversation, message, index, offsetMs = 0) {
  const base = toMillis(message?.createdAt || conversation.createdAt || conversation.updatedAt, Date.now());
  return toIso(base + (index * 1000) + offsetMs);
}

function rawTextContentBlocks(message) {
  const rawContent = message?.raw?.content;
  if (Array.isArray(rawContent)) {
    return rawContent
      .filter((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim())
      .map((block) => ({
        type: 'text',
        text: shortenText(block.text, 80000)
      }));
  }

  if (typeof rawContent === 'string' && rawContent.trim()) {
    return [{ type: 'text', text: shortenText(rawContent, 80000) }];
  }

  return [];
}

function visibleAssistantContentBlocks(message) {
  const rawTextBlocks = rawTextContentBlocks(message);
  if (rawTextBlocks.length > 0) return rawTextBlocks;

  const fallbackText = String(message.content || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(fallbackText) || /^thinking\b/i.test(fallbackText)) {
    return [{
      type: 'text',
      text: '[Non-text assistant event omitted by Claude History Rescue]'
    }];
  }

  return [{
    type: 'text',
    text: shortenText(fallbackText, 80000)
  }];
}

function visibleAssistantText(message) {
  return visibleAssistantContentBlocks(message)
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n');
}

function userContentForAudit(message) {
  return shortenText(message.content, 80000);
}

function buildUserAuditLine(conversation, sessionId, message, index, options = {}) {
  const timestamp = auditTimestamp(conversation, message, index, options.offsetMs || 0);
  const payload = {
    type: 'user',
    message: {
      role: 'user',
      content: userContentForAudit(message)
    },
    session_id: sessionId,
    parent_tool_use_id: null,
    uuid: messageUuid(sessionId, message, index, 'user'),
    _audit_timestamp: timestamp,
    imported_by: 'claude-history-rescue-web'
  };

  if (options.includeTimestamp) payload.timestamp = timestamp;
  if (options.isReplay) payload.isReplay = true;
  if (options.clientPlatform) payload.client_platform = 'desktop_app';

  return JSON.stringify(payload);
}

function buildAssistantAuditLine(conversation, cliSessionId, message, index) {
  const timestamp = auditTimestamp(conversation, message, index, 300);
  const uuid = messageUuid(cliSessionId, message, index, 'assistant');

  return JSON.stringify({
    type: 'assistant',
    message: {
      id: `resp_${crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 32)}`,
      type: 'message',
      role: 'assistant',
      content: visibleAssistantContentBlocks(message),
      model: DEFAULT_MODEL,
      stop_reason: '',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        service_tier: 'standard'
      },
      context_management: null
    },
    parent_tool_use_id: null,
    session_id: cliSessionId,
    uuid,
    timestamp,
    _audit_timestamp: timestamp,
    imported_by: 'claude-history-rescue-web'
  });
}

function buildResultAuditLine(conversation, cliSessionId, message, index) {
  const timestamp = auditTimestamp(conversation, message, index, 600);
  const result = shortenText(visibleAssistantText(message), 80000);

  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    api_error_status: null,
    duration_ms: 0,
    duration_api_ms: 0,
    ttft_ms: 0,
    num_turns: 1,
    result,
    stop_reason: 'end_turn',
    session_id: cliSessionId,
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: {
        web_search_requests: 0,
        web_fetch_requests: 0
      },
      service_tier: 'standard'
    },
    modelUsage: {
      [DEFAULT_MODEL]: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0
      }
    },
    permission_denials: [],
    terminal_reason: 'completed',
    fast_mode_state: 'off',
    uuid: uuidFromHash(`${cliSessionId}:result:${message.id}:${index}`),
    timestamp,
    _audit_timestamp: timestamp,
    imported_by: 'claude-history-rescue-web'
  });
}

function buildSystemInitAuditLine(conversation, cliSessionId, sessionDir) {
  const timestamp = auditTimestamp(conversation, firstUserMessage(conversation), 0, 100);
  return JSON.stringify({
    type: 'system',
    subtype: 'init',
    cwd: path.join(sessionDir, 'outputs'),
    session_id: cliSessionId,
    tools: [],
    mcp_servers: [],
    model: DEFAULT_MODEL,
    permissionMode: 'default',
    slash_commands: [],
    apiKeySource: 'none',
    claude_code_version: 'claude-history-rescue-web',
    output_style: 'default',
    agents: [],
    skills: [],
    plugins: [],
    analytics_disabled: true,
    product_feedback_disabled: true,
    uuid: uuidFromHash(`${cliSessionId}:system:init`),
    memory_paths: {},
    fast_mode_state: 'off',
    _audit_timestamp: timestamp,
    imported_by: 'claude-history-rescue-web'
  });
}

function buildSystemStatusAuditLine(conversation, cliSessionId) {
  const timestamp = auditTimestamp(conversation, firstUserMessage(conversation), 0, 110);
  return JSON.stringify({
    type: 'system',
    subtype: 'status',
    status: 'requesting',
    uuid: uuidFromHash(`${cliSessionId}:system:status`),
    session_id: cliSessionId,
    _audit_timestamp: timestamp,
    imported_by: 'claude-history-rescue-web'
  });
}

function buildAuditJsonl(conversation, sessionUuid, cliSessionId, sessionDir) {
  const visibleMessages = conversation.messages.filter((message) => message.content && message.role !== 'system');
  const firstPrompt = firstUserMessage(conversation);
  const lines = [];

  if (firstPrompt) {
    lines.push(buildUserAuditLine(conversation, sessionUuid, firstPrompt, firstPrompt.index || 0, {
      clientPlatform: true
    }));
  }

  lines.push(buildSystemInitAuditLine(conversation, cliSessionId, sessionDir));
  lines.push(buildSystemStatusAuditLine(conversation, cliSessionId));

  for (const [index, message] of visibleMessages.entries()) {
    if (message.role === 'assistant') {
      lines.push(buildAssistantAuditLine(conversation, cliSessionId, message, index));
      lines.push(buildResultAuditLine(conversation, cliSessionId, message, index));
      continue;
    }

    lines.push(buildUserAuditLine(conversation, cliSessionId, message, index, {
      includeTimestamp: true,
      isReplay: true
    }));
  }

  return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

function baseTranscriptFields({ parentUuid, uuid, timestamp, cwd, cliSessionId }) {
  return {
    parentUuid,
    isSidechain: false,
    uuid,
    timestamp,
    userType: 'external',
    entrypoint: 'local-agent',
    cwd,
    sessionId: cliSessionId,
    version: 'claude-history-rescue-web',
    gitBranch: 'HEAD',
    imported_by: 'claude-history-rescue-web'
  };
}

function buildTranscriptUserLine(conversation, cliSessionId, sessionDir, message, index, parentUuid) {
  const timestamp = auditTimestamp(conversation, message, index);
  const uuid = messageUuid(cliSessionId, message, index, 'transcript-user');

  return {
    line: JSON.stringify({
      ...baseTranscriptFields({
        parentUuid,
        uuid,
        timestamp,
        cwd: path.join(sessionDir, 'outputs'),
        cliSessionId
      }),
      type: 'user',
      message: {
        role: 'user',
        content: userContentForAudit(message)
      },
      permissionMode: 'default',
      promptSource: 'sdk'
    }),
    uuid
  };
}

function buildTranscriptAssistantLine(conversation, cliSessionId, sessionDir, message, index, parentUuid) {
  const timestamp = auditTimestamp(conversation, message, index, 300);
  const uuid = messageUuid(cliSessionId, message, index, 'transcript-assistant');

  return {
    line: JSON.stringify({
      ...baseTranscriptFields({
        parentUuid,
        uuid,
        timestamp,
        cwd: path.join(sessionDir, 'outputs'),
        cliSessionId
      }),
      type: 'assistant',
      message: {
        id: `resp_${crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 32)}`,
        type: 'message',
        role: 'assistant',
        content: visibleAssistantContentBlocks(message),
        model: DEFAULT_MODEL,
        stop_reason: '',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      }
    }),
    uuid
  };
}

function buildTranscriptJsonl(conversation, cliSessionId, sessionDir) {
  const visibleMessages = conversation.messages.filter((message) => message.content && message.role !== 'system');
  const lines = [];
  let parentUuid = null;
  let lastPrompt = '';
  let leafUuid = null;

  for (const [index, message] of visibleMessages.entries()) {
    if (message.role === 'assistant') {
      const assistantLine = buildTranscriptAssistantLine(conversation, cliSessionId, sessionDir, message, index, parentUuid);
      lines.push(assistantLine.line);
      parentUuid = assistantLine.uuid;
      leafUuid = assistantLine.uuid;
      continue;
    }

    lastPrompt = userContentForAudit(message);
    const userLine = buildTranscriptUserLine(conversation, cliSessionId, sessionDir, message, index, parentUuid);
    lines.push(userLine.line);
    parentUuid = userLine.uuid;
    leafUuid = userLine.uuid;
  }

  if (leafUuid) {
    lines.push(JSON.stringify({
      type: 'last-prompt',
      lastPrompt,
      leafUuid,
      sessionId: cliSessionId
    }));
  }

  return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

function buildClaudeProjectConfig({ accountUuid, organizationUuid, emailAddress, createdAt }) {
  return {
    unpinOpus47LaunchEffort: true,
    oauthAccount: {
      accountUuid,
      emailAddress,
      organizationUuid
    },
    firstStartTime: new Date(createdAt).toISOString(),
    opusProMigrationComplete: true,
    sonnet1m45MigrationComplete: true,
    seenNotifications: {},
    migrationVersion: 13,
    userID: crypto.createHash('sha256').update(`${accountUuid}:${emailAddress}`).digest('hex')
  };
}

function buildSessionMetadata({ conversation, sessionId, cliSessionId, sessionDir, accountName, emailAddress }) {
  const createdAt = toMillis(conversation.createdAt || conversation.updatedAt);
  const lastActivityAt = toMillis(conversation.updatedAt || conversation.createdAt, createdAt);
  const initialMessage = firstUserMessage(conversation)?.content || conversation.summary || conversation.title;

  return {
    sessionId,
    processName: 'claude-history-rescue',
    cliSessionId,
    cwd: path.join(sessionDir, 'outputs'),
    userSelectedFolders: [],
    createdAt,
    lastActivityAt,
    model: DEFAULT_MODEL,
    isArchived: false,
    title: conversation.title || 'Imported conversation',
    vmProcessName: 'claude-history-rescue',
    hostLoopMode: true,
    initialMessage: shortenText(initialMessage, 2000),
    slashCommands: [],
    remoteMcpServersConfig: [],
    egressAllowedDomains: [
      '*.anthropic.com',
      'anthropic.com',
      'claude.com',
      '*.claude.com'
    ],
    orgCliExecPolicies: {
      status: 'ok',
      policies: {}
    },
    memoryEnabled: false,
    skillsEnabled: false,
    pluginsEnabled: false,
    isAgentCompleted: true,
    systemPrompt: 'Imported from an official Claude data export by Claude History Rescue Web.',
    accountName,
    emailAddress,
    importedBy: 'claude-history-rescue-web',
    originalConversationId: conversation.id
  };
}

function findDesktopSessionRoots(dataDir) {
  const base = path.join(dataDir, 'local-agent-mode-sessions');
  if (!fs.existsSync(base)) return [];

  return fs.readdirSync(base, { withFileTypes: true })
    .filter((accountEntry) => accountEntry.isDirectory())
    .flatMap((accountEntry) => {
      const accountDir = path.join(base, accountEntry.name);
      return fs.readdirSync(accountDir, { withFileTypes: true })
        .filter((orgEntry) => orgEntry.isDirectory())
        .map((orgEntry) => {
          const sessionRoot = path.join(accountDir, orgEntry.name);
          const files = fs.readdirSync(sessionRoot);
          const localSessionCount = files.filter((file) => /^local_.*\.json$/.test(file)).length;
          return {
            accountUuid: accountEntry.name,
            organizationUuid: orgEntry.name,
            sessionRoot,
            localSessionCount,
            mtimeMs: fs.statSync(sessionRoot).mtimeMs
          };
        });
    })
    .filter((entry) => entry.localSessionCount > 0 || fs.existsSync(path.join(entry.sessionRoot, 'spaces.json')))
    .sort((a, b) => b.localSessionCount - a.localSessionCount || b.mtimeMs - a.mtimeMs);
}

function resolveDesktopDataDir(options = {}) {
  return path.resolve(options.dataDir || path.join(os.homedir(), 'Library/Application Support/Claude-3p'));
}

export function resolveDesktopTarget(options = {}) {
  const dataDir = resolveDesktopDataDir(options);
  if (options.sessionRoot) {
    const sessionRoot = path.resolve(options.sessionRoot);
    const organizationUuid = path.basename(sessionRoot);
    const accountUuid = path.basename(path.dirname(sessionRoot));
    return { dataDir, sessionRoot, accountUuid, organizationUuid };
  }

  const roots = findDesktopSessionRoots(dataDir);
  if (roots.length === 0) {
    throw new Error(`Could not find Claude Desktop local-agent-mode-sessions under ${dataDir}`);
  }

  return {
    dataDir,
    sessionRoot: roots[0].sessionRoot,
    accountUuid: roots[0].accountUuid,
    organizationUuid: roots[0].organizationUuid
  };
}

function buildRestoreEntry(conversation, target, options = {}) {
  const sessionUuid = sessionUuidForConversation(conversation);
  const cliSessionId = uuidFromHash(`${sessionUuid}:cli-session`);
  const sessionId = `local_${sessionUuid}`;
  const sessionDir = path.join(target.sessionRoot, sessionId);
  const transcriptDir = path.join(sessionDir, '.claude', 'projects', 'imported');
  const metadataPath = path.join(target.sessionRoot, `${sessionId}.json`);
  const createdAt = toMillis(conversation.createdAt || conversation.updatedAt);
  const emailAddress = options.emailAddress || 'cowork-3p@localhost';
  const accountName = options.accountName || 'Imported Claude export';

  return {
    conversationId: conversation.id,
    sessionUuid,
    sessionId,
    sessionDir,
    metadataPath,
    auditPath: path.join(sessionDir, 'audit.jsonl'),
    claudeConfigPath: path.join(sessionDir, '.claude', '.claude.json'),
    transcriptDir,
    transcriptPath: path.join(transcriptDir, `${cliSessionId}.jsonl`),
    transcriptAliasPath: path.join(transcriptDir, `${sessionUuid}.jsonl`),
    outputsDir: path.join(sessionDir, 'outputs'),
    uploadsDir: path.join(sessionDir, 'uploads'),
    createdAt,
    lastActivityAt: toMillis(conversation.updatedAt || conversation.createdAt, createdAt),
    title: conversation.title || 'Imported conversation',
    metadata: buildSessionMetadata({
      conversation,
      sessionId,
      cliSessionId,
      sessionDir,
      accountName,
      emailAddress
    }),
    claudeConfig: buildClaudeProjectConfig({
      accountUuid: target.accountUuid,
      organizationUuid: target.organizationUuid,
      emailAddress,
      createdAt
    }),
    auditJsonl: buildAuditJsonl(conversation, sessionUuid, cliSessionId, sessionDir),
    transcriptJsonl: buildTranscriptJsonl(conversation, cliSessionId, sessionDir),
    transcriptAliasJsonl: buildTranscriptJsonl(conversation, sessionUuid, sessionDir),
    exists: fs.existsSync(metadataPath) || fs.existsSync(sessionDir)
  };
}

export function buildDesktopRestorePlan(conversations, options = {}) {
  const target = resolveDesktopTarget(options);
  const limitedConversations = conversations.slice(0, Number(options.limit || conversations.length));
  const entries = limitedConversations.map((conversation) => buildRestoreEntry(conversation, target, options));

  return {
    target,
    entries,
    totalConversations: conversations.length,
    restoreCount: entries.length,
    existingCount: entries.filter((entry) => entry.exists).length
  };
}

function backupPathFor(backupDir, filePath) {
  return path.join(backupDir, filePath.replaceAll('/', '_'));
}

function backupExistingPath(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return null;
  ensureDir(backupDir);
  const targetPath = backupPathFor(backupDir, filePath);
  fs.cpSync(filePath, targetPath, { recursive: true });
  return targetPath;
}

function writeJsonFile(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFileAtomic(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`
  );
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function writeRestoreEntry(entry, backupDir, overwrite = false) {
  if (entry.exists && !overwrite) {
    return { sessionId: entry.sessionId, skipped: true, reason: 'exists' };
  }

  const backups = [
    backupExistingPath(entry.metadataPath, backupDir),
    backupExistingPath(entry.claudeConfigPath, backupDir),
    backupExistingPath(entry.auditPath, backupDir),
    backupExistingPath(entry.transcriptPath, backupDir),
    backupExistingPath(entry.transcriptAliasPath, backupDir)
  ].filter(Boolean);

  ensureDir(entry.outputsDir);
  ensureDir(entry.uploadsDir);
  ensureDir(path.dirname(entry.claudeConfigPath));
  ensureDir(entry.transcriptDir);
  writeJsonFile(entry.metadataPath, entry.metadata);
  writeJsonFile(entry.claudeConfigPath, entry.claudeConfig);
  writeFileAtomic(entry.auditPath, entry.auditJsonl);
  writeFileAtomic(entry.transcriptPath, entry.transcriptJsonl);
  if (entry.transcriptAliasPath !== entry.transcriptPath) {
    writeFileAtomic(entry.transcriptAliasPath, entry.transcriptAliasJsonl);
  }

  return {
    sessionId: entry.sessionId,
    skipped: false,
    metadataPath: entry.metadataPath,
    auditPath: entry.auditPath,
    transcriptPath: entry.transcriptPath,
    transcriptAliasPath: entry.transcriptAliasPath,
    backups
  };
}

function parseLocalStorageValue(rawValue) {
  const text = String(rawValue || '');
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) return null;
  const prefix = text.slice(0, jsonStart);
  const jsonText = text.slice(jsonStart);
  const json = readJsonSafe(jsonText, null);
  return json ? { prefix, json } : null;
}

async function findLevelKey(database, keyFragment) {
  for await (const [key] of database.iterator()) {
    if (String(key).includes(keyFragment)) return key;
  }
  return null;
}

async function updateReadStateIndex(plan, options = {}) {
  const leveldbPath = path.join(plan.target.dataDir, 'Local Storage', 'leveldb');
  if (!fs.existsSync(leveldbPath)) {
    return { updated: false, reason: 'missing-leveldb', leveldbPath };
  }

  const database = new Level(leveldbPath, { valueEncoding: 'utf8' });
  await database.open();
  try {
    const key = await findLevelKey(database, LOCAL_STORAGE_READ_STATE_KEY);
    if (!key) {
      return { updated: false, reason: 'missing-read-state-key', leveldbPath };
    }

    const currentValue = await database.get(key);
    const parsed = parseLocalStorageValue(currentValue);
    if (!parsed) {
      return { updated: false, reason: 'unparseable-read-state', leveldbPath };
    }

    const sessions = { ...(parsed.json.sessions || {}) };
    for (const entry of plan.entries) {
      sessions[entry.sessionId] = entry.lastActivityAt;
    }

    const nextValue = `${parsed.prefix}${JSON.stringify({
      ...parsed.json,
      sessions,
      initializedAt: parsed.json.initializedAt || Date.now(),
      explicitUnread: parsed.json.explicitUnread || {}
    })}`;

    if (options.backupDir) {
      ensureDir(options.backupDir);
      fs.writeFileSync(path.join(options.backupDir, 'cowork-read-state.before.txt'), currentValue, 'utf8');
      fs.writeFileSync(path.join(options.backupDir, 'cowork-read-state.after.txt'), nextValue, 'utf8');
    }

    await database.put(key, nextValue);
    return { updated: true, key: String(key), leveldbPath, sessionsAdded: plan.entries.length };
  } finally {
    await database.close().catch(() => {});
  }
}

export async function applyDesktopRestorePlan(plan, options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(options.backupDir || path.join(process.cwd(), '.claude-history-rescue', 'backups', `desktop-restore-${timestamp}`));
  const overwrite = Boolean(options.overwrite);
  const written = plan.entries.map((entry) => writeRestoreEntry(entry, backupDir, overwrite));
  let readState = { updated: false, reason: 'not-requested' };

  if (options.updateReadState) {
    try {
      readState = await updateReadStateIndex(plan, { backupDir });
    } catch (error) {
      readState = {
        updated: false,
        reason: 'failed',
        message: error.cause?.code === 'LEVEL_LOCKED'
          ? 'Claude Desktop is running and has locked Local Storage. Quit Claude, then rerun with --update-read-state.'
          : error.message
      };
    }
  }

  return {
    target: plan.target,
    backupDir,
    written,
    readState
  };
}
