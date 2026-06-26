import { isObject, toArray } from '../core.js';

const MESSAGE_ROLE_HINTS = {
  assistant: 'assistant',
  bot: 'assistant',
  claude: 'assistant',
  human: 'user',
  user: 'user',
  system: 'system'
};

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeRole(sender) {
  const candidate = String(sender || '').toLowerCase();
  if (candidate === 'human' || candidate === 'user') return 'user';
  if (candidate === 'assistant' || candidate === 'claude' || candidate === 'bot') return 'assistant';
  if (candidate === 'system' || candidate === 'developer') return 'system';
  return MESSAGE_ROLE_HINTS[candidate] || 'unknown';
}

function collectText(value, depth = 0) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => collectText(entry, depth + 1)).filter(Boolean).join('\n').trim();
  }
  if (!isObject(value) || depth > 6) return '';

  const preferredKeys = ['text', 'content', 'value', 'message', 'summary', 'body', 'transcript', 'prompt', 'response'];
  const preferred = preferredKeys.map((key) => value[key]).filter((entry) => entry !== undefined);
  if (preferred.length > 0) {
    const text = preferred.map((entry) => collectText(entry, depth + 1)).filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  return Object.values(value).map((entry) => collectText(entry, depth + 1)).filter(Boolean).join('\n').trim();
}

function collectAttachmentText(attachments) {
  return toArray(attachments).map((attachment) => {
    if (!isObject(attachment)) {
      return collectText(attachment);
    }

    const parts = [
      attachment.file_name,
      attachment.file_name ? `[Attachment] ${attachment.file_name}` : '',
      attachment.extracted_content,
      attachment.summary,
      attachment.content
    ];

    return parts.map((part) => collectText(part)).filter(Boolean).join('\n').trim();
  }).filter(Boolean).join('\n\n').trim();
}

function normalizeMessage(rawMessage, conversationId, index) {
  const roleCandidate = firstDefined(
    rawMessage?.role,
    rawMessage?.author,
    rawMessage?.sender,
    rawMessage?.from,
    rawMessage?.speaker,
    rawMessage?.type
  );
  const role = normalizeRole(roleCandidate);
  const messageText = collectText(firstDefined(rawMessage?.content, rawMessage?.text, rawMessage?.message, rawMessage?.parts, rawMessage?.body));
  const attachmentText = collectAttachmentText(rawMessage?.attachments);
  const content = [messageText, attachmentText].filter(Boolean).join('\n\n').trim();
  const createdAt = firstDefined(
    rawMessage?.created_at,
    rawMessage?.createdAt,
    rawMessage?.timestamp,
    rawMessage?.time,
    rawMessage?.date
  );
  const id = String(firstDefined(rawMessage?.id, rawMessage?.message_id, rawMessage?.uuid, `${conversationId}-${index}`));

  return {
    id,
    conversationId,
    role,
    content,
    createdAt: createdAt ? String(createdAt) : null,
    index,
    raw: rawMessage
  };
}

function extractConversationId(rawConversation, documentPath, index) {
  return String(firstDefined(
    rawConversation?.id,
    rawConversation?.uuid,
    rawConversation?.conversation_id,
    rawConversation?.conversationId,
    rawConversation?.thread_id,
    rawConversation?.threadId,
    `${documentPath.replaceAll('/', '_')}-${index}`
  ));
}

function extractTitle(rawConversation, messages) {
  const explicit = firstDefined(rawConversation?.title, rawConversation?.name, rawConversation?.subject);
  if (explicit) return String(explicit).trim();

  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content);
  if (firstUserMessage?.content) {
    return firstUserMessage.content.split('\n').map((line) => line.trim()).filter(Boolean)[0].slice(0, 80);
  }

  return 'Untitled conversation';
}

function looksLikeConversation(value) {
  if (!isObject(value)) return false;
  const messageArray = [
    value.messages,
    value.turns,
    value.chat_messages,
    value.items,
    value.chatMessages
  ].find(Array.isArray);

  if (!messageArray) return false;

  const keyCount = Object.keys(value).length;
  const hasMessageLikeKeys = ['id', 'uuid', 'title', 'name', 'summary', 'created_at', 'updated_at', 'account'].some((key) => key in value);
  return hasMessageLikeKeys || keyCount <= 10;
}

function walkCandidates(node, documentPath, results, seen, indexState) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      walkCandidates(item, documentPath, results, seen, indexState);
    }
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);

  if (looksLikeConversation(node)) {
    results.push({ node, documentPath, index: indexState.value++ });
  }

  if (Array.isArray(node.conversations)) {
    for (const item of node.conversations) {
      walkCandidates(item, documentPath, results, seen, indexState);
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkCandidates(item, documentPath, results, seen, indexState);
      }
      continue;
    }
    if (isObject(value)) {
      walkCandidates(value, documentPath, results, seen, indexState);
    }
  }
}

export function extractConversationsFromDocuments(documents) {
  const candidates = [];
  const seen = new WeakSet();
  const indexState = { value: 0 };

  for (const document of documents) {
    walkCandidates(document.json, document.path, candidates, seen, indexState);
  }

  return candidates.map(({ node, documentPath, index }) => normalizeConversation(node, documentPath, index));
}

export function normalizeConversation(rawConversation, documentPath, index) {
  const rawMessages = toArray(
    rawConversation?.messages
    || rawConversation?.turns
    || rawConversation?.chat_messages
    || rawConversation?.items
    || rawConversation?.chatMessages
  );

  const conversationId = extractConversationId(rawConversation, documentPath, index);
  const messages = rawMessages.map((message, messageIndex) => normalizeMessage(message, conversationId, messageIndex));
  const title = extractTitle(rawConversation, messages);
  const createdAt = firstDefined(rawConversation?.created_at, rawConversation?.createdAt, rawConversation?.started_at, rawConversation?.start_time);
  const updatedAt = firstDefined(rawConversation?.updated_at, rawConversation?.updatedAt, rawConversation?.last_updated, rawConversation?.lastMessageAt);
  const projectId = firstDefined(rawConversation?.project_id, rawConversation?.projectId, rawConversation?.account?.project_id, rawConversation?.account?.projectId);
  const projectName = firstDefined(rawConversation?.project_name, rawConversation?.projectName, rawConversation?.account?.project_name, rawConversation?.account?.projectName);

  return {
    id: conversationId,
    title,
    summary: firstDefined(rawConversation?.summary, rawConversation?.description) || null,
    createdAt: createdAt ? String(createdAt) : null,
    updatedAt: updatedAt ? String(updatedAt) : null,
    projectId: projectId ? String(projectId) : null,
    projectName: projectName ? String(projectName) : null,
    sourcePath: documentPath,
    raw: rawConversation,
    messages
  };
}
