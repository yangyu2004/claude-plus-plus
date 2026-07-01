const MAX_PROMPT_PREVIEW_LENGTH = 240;

export function buildResumePrompt(conversation) {
  const lines = [];
  lines.push('You are resuming a prior Claude conversation from an imported archive.');
  lines.push('');
  lines.push(`Conversation title: ${conversation.title}`);
  lines.push(`Original conversation id: ${conversation.id}`);
  lines.push('');
  lines.push('Context summary:');

  for (const message of conversation.messages.slice(-12)) {
    const speaker = message.role || 'unknown';
    const content = (message.content || '').trim();
    if (!content) continue;
    lines.push(`- ${speaker}: ${content.slice(0, MAX_PROMPT_PREVIEW_LENGTH)}`);
  }

  lines.push('');
  lines.push('Please continue from this context and preserve the original intent.');
  return lines.join('\n');
}
