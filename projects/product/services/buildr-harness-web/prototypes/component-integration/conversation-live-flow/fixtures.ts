import type { CatalogModel, ConnectionView, ConversationEntry, ConversationRequest, ConversationView } from '../../features/agent-conversations/types';

export const workspace = { id: 'demo-buildr', name: 'Buildr', rootPath: '/example/Buildr' };
export const connection: ConnectionView = { id: 'codex', provider: 'codex', label: 'Codex', revision: 'demo', status: 'ready', enabled: true, models: [{ id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', isDefault: true }], capabilities: { text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 262144, maxImageBytes: 8388608, permissionModes: ['default', 'full-access'] } };
export const model: CatalogModel = { id: 'demo:gpt-6.1-sol', accountId: 'demo', accountIdentity: 'demo', accountRevision: 'demo', accountLabel: '示例账号', provider: 'codex', modelId: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', available: true, images: true, tools: true, contextWindow: 256000, reasoningEfforts: [{ id: 'high', label: '高' }], defaultReasoningEffort: 'high' };
export const firstQuestion = '优化一下对话的体验。执行时能自然看到助手的说明和工具，结束后保留答复，处理过程自动收起来。';
export const supplement = '还有，执行中也要能直接发送图片。工具和回复放在同一层，不用竖线区分。';
export const finalAnswer = '对话体验已调整：\n\n- 执行中可以继续发送文字和图片。\n- 助手说明与工具按顺序直接展示。\n- 完成后自动收起处理过程，展开后保持相同层级。\n- 呼吸灯和累计时间表示当前仍在执行。';
function entry(id: string, text: string, seconds: number, patch: Partial<ConversationEntry> = {}): ConversationEntry {
  return { id, text, sequence: seconds + 1, kind: 'message', role: 'assistant', provider: 'codex', participantId: 'codex-demo', runId: 'run-demo', createdAt: new Date(Date.now() - 110000 + seconds * 1000).toISOString(), status: 'completed', ...patch };
}
export function firstProcess(): ConversationEntry[] {
  return [
    entry('note-start', '我先核对当前对话的发送入口和信息流，再调整执行中的补充方式。', 1),
    entry('read-panel', '已读取输入区、过程展示和图片处理的实现。', 5, { kind: 'tool', role: 'system', name: 'read', input: JSON.stringify({ file_path: 'src/features/agent-conversations/ConversationPanel.tsx' }) }),
    entry('search-tools', '找到过程分组和执行状态的展示位置。', 12, { kind: 'tool', role: 'system', name: 'grep', input: JSON.stringify({ pattern: 'ConversationProcessBlock|executionLocked', path: 'src/features' }) }),
    entry('note-found', '已找到两个影响：执行中输入被限制为草稿，连续工具也被提前折叠了。我会一起调整。', 21),
  ];
}
export function continuedProcess(): ConversationEntry[] {
  return [
    entry('note-supplement', '我会把这张截图和刚才的要求一起考虑，继续处理当前工作。', 34),
    entry('edit-flow', '已调整执行过程的平铺展示和结束后的自动折叠。', 47, { kind: 'tool', role: 'system', name: 'edit', input: JSON.stringify({ file_path: 'src/features/agent-conversations/ConversationProcessBlock.tsx' }) }),
    entry('check-flow', '正在检查对话发送、图片和历史记录。', 62, { kind: 'tool', role: 'system', name: 'command', input: JSON.stringify({ command: 'npm run test -- conversation-flow' }), status: 'running' }),
  ];
}
export function approvalRequest(): ConversationRequest {
  return { id: 'approval-demo', kind: 'approval', title: '允许执行这次命令？', description: 'npm run test -- conversation-flow', options: [{ id: 'deny', label: '拒绝' }, { id: 'allow-once', label: '允许本次' }], conversationId: 'conversation-demo', workspaceId: workspace.id, participantId: 'codex-demo', runId: 'run-demo', generation: 'demo' };
}
export function sampleConversation(): ConversationView {
  const startedAt = new Date(Date.now() - 110000).toISOString();
  return { id: 'conversation-demo', workspaceId: workspace.id, cwd: workspace.rootPath, taskId: 'conversation-live-flow', title: '让对话自然地继续', revision: 'demo', hidden: false, updatedAt: new Date().toISOString(), participants: [], entries: [], requests: [], activity: { version: 1, seenThrough: 1, updatedAt: new Date().toISOString(), active: true }, run: { id: 'run-demo', participantId: 'codex-demo', provider: 'codex', generation: 'demo', status: 'running', accepted: true, tools: [], model: 'gpt-6.1-sol', modelAccountId: 'demo', permissionMode: 'default', startedAt, updatedAt: new Date().toISOString() } };
}

/** A small local sample lets the image interaction be exercised without reading any user file. */
export async function sampleImage(): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 280;
  const context = canvas.getContext('2d'); if (!context) throw new Error('示例图片暂时无法生成。');
  context.fillStyle = '#f3f6f4'; context.fillRect(0, 0, 480, 280);
  context.fillStyle = '#ffffff'; context.fillRect(16, 18, 448, 244);
  context.fillStyle = '#e4eee8'; context.fillRect(16, 18, 448, 35);
  context.fillStyle = '#5e8270'; context.font = '14px sans-serif'; context.fillText('对话信息流', 34, 41);
  context.fillStyle = '#eaf2ed'; context.fillRect(160, 72, 280, 44);
  context.fillStyle = '#657b6d'; context.font = '13px sans-serif'; context.fillText('执行中也可以继续发送图片', 178, 99);
  context.fillStyle = '#5a7565'; context.fillText('我会继续核对图片和刚才的要求。', 35, 148);
  context.fillStyle = '#dce7df'; context.fillRect(36, 170, 330, 7); context.fillRect(36, 189, 250, 7);
  context.strokeStyle = '#8ab39d'; context.strokeRect(32, 218, 414, 27);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('示例图片暂时无法生成。');
  return new File([blob], '对话截图.png', { type: 'image/png' });
}
