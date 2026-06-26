import { formatDate } from '../core.js';

export function conversationToMarkdown(conversation) {
  const lines = [];
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`- Conversation ID: \`${conversation.id}\``);
  if (conversation.created_at || conversation.createdAt) {
    lines.push(`- Created: ${formatDate(conversation.created_at || conversation.createdAt)}`);
  }
  if (conversation.updated_at || conversation.updatedAt) {
    lines.push(`- Updated: ${formatDate(conversation.updated_at || conversation.updatedAt)}`);
  }
  lines.push('');

  for (const message of conversation.messages) {
    lines.push(`## ${message.role || 'unknown'}`);
    if (message.created_at || message.createdAt) {
      lines.push(`_ ${formatDate(message.created_at || message.createdAt)} _`);
    }
    lines.push('');
    lines.push(message.content || '');
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
