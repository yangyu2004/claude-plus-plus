import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDir } from '../core.js';

const VERSION = '2.1.187';
const MODEL = 'claude-opus-4-8';
const PREAMBLE_RE =
  /^(i'?ll|i will|i want to|i need to|let me|i'?m going to|i'?m about to|first,? i)\b.{0,40}\b(read|look|re-?read|check|pull|open|review|go through|start by|examine)\b/i;

function defaultDataDir() {
  return path.join(os.homedir(), 'Library/Application Support/Claude');
}

function defaultProjectsDir() {
  return path.join(os.homedir(), '.claude/projects');
}

function escapeCwd(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
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

function toMillis(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toIso(value, fallbackMs) {
  return new Date(toMillis(value, fallbackMs)).toISOString();
}

function nextMeaningfulType(blocks, index) {
  for (let candidateIndex = index + 1; candidateIndex < blocks.length; candidateIndex += 1) {
    const block = blocks[candidateIndex];
    if (block && typeof block === 'object' && block.type !== 'thinking') return block.type;
  }
  return null;
}

function visibleMessageText(rawMessage) {
  const blocks = Array.isArray(rawMessage?.content) ? rawMessage.content : [];
  const kept = [];

  blocks.forEach((block, index) => {
    if (!block || typeof block !== 'object' || block.type !== 'text') return;
    const text = String(block.text || '').trim();
    if (!text) return;
    if (nextMeaningfulType(blocks, index) === 'tool_use' && (text.length < 80 || PREAMBLE_RE.test(text))) {
      return;
    }
    kept.push(text);
  });

  let body = kept.join('\n\n').trim();
  if (!body) {
    const hasNoise = blocks.some(
      (block) => block && typeof block === 'object' && ['thinking', 'tool_use', 'tool_result'].includes(block.type)
    );
    if (!hasNoise) {
      if (typeof rawMessage?.content === 'string') body = rawMessage.content.trim();
      if (!body) body = String(rawMessage?.text || '').trim();
    }
  }

  const parts = body ? [body] : [];
  for (const attachment of rawMessage?.attachments || []) {
    if (!attachment || typeof attachment !== 'object') continue;
    const fileName = attachment.file_name || '';
    const extractedContent = String(attachment.extracted_content || '').trim();
    if (extractedContent) parts.push(fileName ? `\n[附件：${fileName}]\n${extractedContent}` : extractedContent);
    else if (fileName) parts.push(`[附件：${fileName}]`);
  }

  for (const file of rawMessage?.files || []) {
    if (file && typeof file === 'object' && file.file_name) parts.push(`[文件：${file.file_name}]`);
  }

  return parts.filter(Boolean).join('\n\n').trim();
}

function renderableMessages(conversation) {
  return (conversation.messages || [])
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: visibleMessageText(message.raw),
      raw: message.raw
    }))
    .filter((message) => message.text);
}

function hasContent(conversation) {
  return renderableMessages(conversation).length > 0;
}

function buildTranscript(conversation, cliSessionId, cwd) {
  const baseMs = toMillis(conversation.createdAt, 0);
  const lines = [];
  let parentUuid = null;
  let leafUuid = null;
  let lastPrompt = '';
  let userTurns = 0;

  renderableMessages(conversation).forEach((message, index) => {
    const timestamp = toIso(message.raw?.created_at, baseMs + index * 1000);
    const uuid = uuidFromHash(`${cliSessionId}:msg:${index}`);
    if (message.role === 'user') {
      userTurns += 1;
      lastPrompt = message.text;
      lines.push(JSON.stringify({
        parentUuid,
        isSidechain: false,
        promptId: uuidFromHash(`${cliSessionId}:prompt:${index}`),
        type: 'user',
        message: { role: 'user', content: message.text },
        uuid,
        timestamp,
        permissionMode: 'acceptEdits',
        origin: { kind: 'human' },
        promptSource: 'sdk',
        userType: 'external',
        entrypoint: 'claude-desktop',
        cwd,
        sessionId: cliSessionId,
        version: VERSION,
        gitBranch: 'HEAD'
      }));
    } else {
      const messageId = `msg_${crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 24)}`;
      lines.push(JSON.stringify({
        parentUuid,
        isSidechain: false,
        message: {
          model: MODEL,
          id: messageId,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: message.text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            service_tier: 'standard'
          }
        },
        requestId: `req_${crypto.createHash('sha256').update(`${uuid}r`).digest('hex').slice(0, 24)}`,
        type: 'assistant',
        uuid,
        timestamp,
        userType: 'external',
        entrypoint: 'claude-desktop',
        cwd,
        sessionId: cliSessionId,
        version: VERSION,
        gitBranch: 'HEAD'
      }));
    }
    parentUuid = uuid;
    leafUuid = uuid;
  });

  lines.push(JSON.stringify({
    type: 'ai-title',
    aiTitle: (conversation.title || '导入的对话').trim(),
    sessionId: cliSessionId
  }));

  if (leafUuid) {
    lines.push(JSON.stringify({
      type: 'last-prompt',
      lastPrompt,
      leafUuid,
      sessionId: cliSessionId
    }));
  }

  return {
    jsonl: `${lines.join('\n')}\n`,
    userTurns
  };
}

function buildMetadata(conversation, sessionId, cliSessionId, cwd, userTurns) {
  const createdAt = toMillis(conversation.createdAt, 0);
  const updatedAt = toMillis(conversation.updatedAt, createdAt);
  return {
    sessionId,
    cliSessionId,
    cwd,
    originCwd: cwd,
    lastFocusedAt: updatedAt,
    createdAt,
    lastActivityAt: updatedAt,
    model: MODEL,
    effort: 'high',
    sessionSettings: {},
    isArchived: false,
    title: (conversation.title || '导入的对话').trim(),
    titleSource: 'auto',
    permissionMode: 'auto',
    remoteMcpServersConfig: [],
    chromePermissionMode: 'skip_all_permission_checks',
    completedTurns: userTurns,
    alwaysAllowedReasons: [],
    sessionPermissionUpdates: [],
    classifierSummaryEnabled: true,
    spawnSeed: {},
    importedBy: 'claude-plus-plus-official',
    originalConversationId: conversation.id
  };
}

function detectAccountAndOrganization(sessionsBase) {
  if (!fs.existsSync(sessionsBase)) return null;
  for (const accountUuid of fs.readdirSync(sessionsBase).sort()) {
    const accountPath = path.join(sessionsBase, accountUuid);
    if (!fs.statSync(accountPath).isDirectory()) continue;
    for (const organizationUuid of fs.readdirSync(accountPath).sort()) {
      if (fs.statSync(path.join(accountPath, organizationUuid)).isDirectory()) {
        return { accountUuid, organizationUuid };
      }
    }
  }
  return null;
}

export function resolveOfficialDesktopTarget(options = {}) {
  const dataDir = path.resolve(options.dataDir || defaultDataDir());
  const projectsDir = path.resolve(options.projectsDir || defaultProjectsDir());
  const cwd = path.resolve(options.cwd || process.cwd());
  let sessionsDir;
  let accountUuid;
  let organizationUuid;

  if (options.sessionRoot) {
    sessionsDir = path.resolve(options.sessionRoot);
    organizationUuid = path.basename(sessionsDir);
    accountUuid = path.basename(path.dirname(sessionsDir));
  } else {
    const sessionsBase = path.join(dataDir, 'claude-code-sessions');
    const found = detectAccountAndOrganization(sessionsBase);
    if (!found) {
      throw new Error(`Could not find Claude Desktop official sessions under ${sessionsBase}. Pass --session-root <dir>.`);
    }
    accountUuid = found.accountUuid;
    organizationUuid = found.organizationUuid;
    sessionsDir = path.join(sessionsBase, accountUuid, organizationUuid);
  }

  return {
    variant: 'official',
    dataDir,
    projectsDir,
    cwd,
    sessionsDir,
    accountUuid,
    organizationUuid
  };
}

function buildRestoreEntry(conversation, target) {
  const sessionUuid = uuidFromHash(`official-restore:session:${conversation.id}`);
  const cliSessionId = uuidFromHash(`official-restore:cli:${conversation.id}`);
  const sessionId = `local_${sessionUuid}`;
  const metadataPath = path.join(target.sessionsDir, `${sessionId}.json`);
  const transcriptDir = path.join(target.projectsDir, escapeCwd(target.cwd));
  const transcriptPath = path.join(transcriptDir, `${cliSessionId}.jsonl`);
  const transcript = buildTranscript(conversation, cliSessionId, target.cwd);

  return {
    conversationId: conversation.id,
    sessionUuid,
    sessionId,
    cliSessionId,
    title: (conversation.title || '导入的对话').trim(),
    metadataPath,
    transcriptDir,
    transcriptPath,
    metadata: buildMetadata(conversation, sessionId, cliSessionId, target.cwd, transcript.userTurns),
    transcriptJsonl: transcript.jsonl,
    exists: fs.existsSync(metadataPath)
  };
}

export function buildOfficialDesktopRestorePlan(conversations, options = {}) {
  const target = resolveOfficialDesktopTarget(options);
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

function backupFileIfExists(filePath, backupDir) {
  if (!backupDir || !fs.existsSync(filePath)) return null;
  ensureDir(backupDir);
  const backupPath = path.join(backupDir, path.basename(filePath));
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeRestoreEntry(entry, options = {}) {
  const overwrite = Boolean(options.overwrite);
  if (entry.exists && !overwrite) {
    return {
      sessionId: entry.sessionId,
      title: entry.title,
      skipped: true,
      reason: 'exists'
    };
  }

  const backups = [
    backupFileIfExists(entry.metadataPath, options.backupDir),
    backupFileIfExists(entry.transcriptPath, options.backupDir)
  ].filter(Boolean);

  ensureDir(entry.transcriptDir);
  writeJsonFile(entry.metadataPath, entry.metadata);
  writeFileAtomic(entry.transcriptPath, entry.transcriptJsonl);

  return {
    sessionId: entry.sessionId,
    cliSessionId: entry.cliSessionId,
    title: entry.title,
    skipped: false,
    metadataPath: entry.metadataPath,
    transcriptPath: entry.transcriptPath,
    backups
  };
}

export async function applyOfficialDesktopRestorePlan(plan, options = {}) {
  const overwrite = Boolean(options.overwrite);
  const backupDir = options.backupDir ? path.resolve(options.backupDir) : null;
  const written = plan.entries.map((entry) => writeRestoreEntry(entry, { overwrite, backupDir }));

  return {
    target: plan.target,
    backupDir,
    written,
    readState: { updated: false, reason: 'not-required' }
  };
}
