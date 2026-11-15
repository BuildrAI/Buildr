import type { ExecutorItem } from '../../contracts.ts';
import { nativeParticipation, participationRequests } from '../../domain/participation.ts';
import { nativePreview, visibleText } from '../native-process.ts';

export function codexItem(item: any, executionId: string, status: string, full = false): ExecutorItem[] {
  if (!item?.id) return [];
  const output = (value: string) => full ? value : nativePreview(value);
  // A stopped turn does not undo tools which already completed. Conversely,
  // an unfinished historical item is uncertain, not a live execution.
  const final: ExecutorItem['status'] = item.status === 'completed' ? 'completed' : item.status === 'failed' || item.status === 'declined' ? 'failed' : item.status === 'inProgress' ? status === 'inProgress' ? 'running' : undefined : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'interrupted' ? undefined : 'running';
  if (item.type === 'agentMessage') return [{ id: item.id, kind: 'message', role: 'assistant', text: String(item.text ?? ''), executionId, status: final }];
  if (item.type === 'userMessage') return [{ id: item.id, ...(typeof item.clientId === 'string' && item.clientId ? { clientRequestId: item.clientId } : {}), kind: 'message', role: 'user', text: visibleText(item.content), executionId, status: 'completed' }];
  if (item.type === 'commandExecution') return [{ id: item.id, kind: 'tool', nativeTool: true, role: 'system', name: 'command', participation: nativeParticipation(item.command===undefined?undefined:String(item.command), item.aggregatedOutput === undefined ? undefined : String(item.aggregatedOutput), item.exitCode === 0 ? 'succeeded' : typeof item.exitCode === 'number' || item.status === 'failed' ? 'failed' : final === 'running' ? 'pending' : 'unknown', item.exitCode), input: String(item.command ?? ''), text: String(item.command ?? '命令') + (item.aggregatedOutput ? '\n' + output(String(item.aggregatedOutput)) : ''), executionId, status: final }];
  if (item.type === 'imageView') return [{ id: item.id, kind: 'tool', nativeTool: true, role: 'system', name: 'view-image', text: '查看图片\n' + String(item.path ?? ''), executionId, status: 'completed' }];
  if (item.type === 'fileChange') return [{ id: item.id, kind: 'tool', nativeTool: true, role: 'system', name: 'file-change', participation:nativeParticipation(item.changes===undefined?undefined:JSON.stringify(item.changes),undefined,item.status==='failed'?'failed':final==='running'?'pending':'unknown'), input: full ? JSON.stringify({changes:item.changes,stdout:item.stdout,stderr:item.stderr}) : undefined, text: '修改文件\n' + (item.changes ?? []).map((change: any) => String(change.path ?? '')).join('\n'), executionId, status: final }];
  if (item.type === 'mcpToolCall') {
    const input=item.arguments===undefined?undefined:JSON.stringify(item.arguments);
    const participation=nativeParticipation(input,item.result===undefined?undefined:typeof item.result==='string'||Array.isArray(item.result)?visibleText(item.result):Array.isArray(item.result?.content)?visibleText(item.result.content):undefined,item.error?'failed':final==='running'?'pending':'unknown');
    participation.matches=participationRequests(item.tool,input);
    return [{ id: item.id, kind: 'tool', nativeTool: true, role: 'system', name: 'mcp-tool', participation, input: input===undefined?undefined:output(input), text: String(item.tool ?? '工具') + (full && item.result !== undefined ? '\n' + (typeof item.result === 'string' ? item.result : JSON.stringify(item.result)) : ''), executionId, status: final }];
  }
  return [];
}
