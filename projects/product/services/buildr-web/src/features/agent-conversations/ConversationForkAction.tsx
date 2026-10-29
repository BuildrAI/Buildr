import { useRef, useState } from 'react';
import { Button } from 'antd';
import { ForkOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import type { ConversationView } from './types';

export function ConversationForkAction({ conversation, entryId }: { conversation: ConversationView; entryId: string }) {
  const context = useAgentConversations();
  const requestId = useRef<string | null>(null), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const fork = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    requestId.current ??= crypto.randomUUID();
    const selection = context.getSelection();
    try {
      const child = await context.api.fork(conversation, entryId, requestId.current);
      if (context.isSelectionCurrent(selection)) {
        await context.openConversation(child.workspaceId, child.id, {preserveVisibility:true});
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.ac-panel textarea')?.focus());
      }
      void context.refreshActivity();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '分叉未完成，原对话已保留。'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <span className="ac-fork-action">
    <Button type="text" size="small" icon={<ForkOutlined />} loading={busy} onClick={() => void fork()} aria-label="分支到新对话">分支到新对话</Button>
    {error && <small role="alert" className="ac-input-diagnostic">{error}</small>}
  </span>;
}
