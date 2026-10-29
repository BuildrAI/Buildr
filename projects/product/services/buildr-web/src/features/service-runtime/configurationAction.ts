import type { TextConversationActionInput, TextConversationActionResult } from '../agent-conversations/AgentConversationsContext';
import { runtimeConfigurationPrompt } from './configurationPrompt.ts';

export type RuntimeConfigurationTarget = { code: string; name: string };
export type RuntimeConfigurationActionResult =
  | { status: 'started' }
  | { status: 'recovering'; message: string }
  | { status: 'busy'; message: string }
  | { status: 'copy'; tone: 'info' | 'warning' | 'error'; message: string };

/** 只在尚未创建执行时选择复制；已受理或待核对都留在原对话恢复。 */
export async function executeRuntimeConfiguration({
  workspaceId,
  workspace,
  service,
  start,
}: {
  workspaceId: string | null;
  workspace: { name: string; rootPath: string } | null;
  service: RuntimeConfigurationTarget;
  start?: (input: TextConversationActionInput) => Promise<TextConversationActionResult>;
}): Promise<RuntimeConfigurationActionResult> {
  const text = runtimeConfigurationPrompt({ workspace, serviceCode: service.code, serviceName: service.name });
  if (!workspaceId || !text) return { status: 'copy', tone: 'error', message: '当前工作空间或服务身份尚未读取，暂时无法准备配置请求。' };
  if (!start) return { status: 'copy', tone: 'info', message: '当前没有可用的内部智能体。复制指令后，发送给你正在使用的智能体。' };
  const result = await start({ workspaceId, cwd: workspace!.rootPath.trim(), text });
  if (result.status === 'started') return { status: 'started' };
  if (result.status === 'recovering') return { status: 'recovering', message: result.message };
  if (result.status === 'busy') return { status: 'busy', message: result.message };
  return { status: 'copy', tone: result.status === 'failed' ? 'error' : 'warning', message: result.message };
}
