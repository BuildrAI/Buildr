import { AGENT_SERVICE_HTTP_SCHEMAS as schemas } from './agent-service-http-contracts.ts';
import type { ProgrammaticScope } from '../../persistence/programmatic-credentials.ts';
export const PROGRAMMATIC_BASE = '/api/v1/programmatic';
export interface PublicOperation { id: string; method: string; path: string; scope: ProgrammaticScope; input: keyof typeof schemas; output: keyof typeof schemas; summary: string; query?: string[] }
/** Single allowlist shared by dispatch, discovery and OpenAPI; no administrative endpoints. */
export const PROGRAMMATIC_OPERATIONS: PublicOperation[] = [
  { id: 'draft', method: 'GET', path: '/drafts/:draftId', scope: 'read', input: 'empty', output: 'draftImages', summary: '读取新草稿修订' },
  { id: 'start', method: 'POST', path: '/drafts/:draftId/send', scope: 'execute', input: 'startDraft', output: 'draftStarted', summary: '幂等首发；相同draftId和clientRequestId只创建一次' },
  { id: 'lookup-draft', method: 'GET', path: '/drafts/:draftId/submissions/:clientRequestId', scope: 'read', input: 'empty', output: 'draftLookup', summary: '首发超时后查询原提交' },
  { id: 'list', method: 'GET', path: '', scope: 'read', input: 'empty', output: 'conversations', summary: '分页查询工作空间对话', query: ['taskId', 'cursor', 'limit', 'hidden', 'query', 'active', 'attention', 'fields'] },
  { id: 'read', method: 'GET', path: '/:conversationId', scope: 'read', input: 'empty', output: 'conversation', summary: '读状态、消息、问题和成果引用', query: ['before', 'limit'] },
  { id: 'lookup-send', method: 'GET', path: '/:conversationId/submissions/:clientRequestId', scope: 'read', input: 'empty', output: 'draftLookup', summary: '后续发送超时后找回原请求及执行' },
  { id: 'entries', method: 'GET', path: '/:conversationId/entries', scope: 'read', input: 'empty', output: 'conversation', summary: '分页读取消息', query: ['before', 'limit'] },
  { id: 'run-final-reply', method: 'GET', path: '/:conversationId/runs/:runId/final-reply', scope: 'read', input: 'empty', output: 'runFinalReply', summary: '只返回指定执行轮次的最终 assistant 回复全文' },
  { id: 'observe', method: 'POST', path: '/:conversationId/observe', scope: 'read', input: 'empty', output: 'conversation', summary: '重新观察执行；不重发工作' },
  { id: 'prepare-send', method: 'POST', path: '/:conversationId/prepare-send', scope: 'execute', input: 'draft', output: 'preview', summary: '按已观察修订准备发送' },
  { id: 'send', method: 'POST', path: '/:conversationId/send', scope: 'execute', input: 'send', output: 'sent', summary: '发送后续消息；clientRequestId必须跨重试保留' },
  { id: 'messages', method: 'POST', path: '/:conversationId/messages', scope: 'execute', input: 'messages', output: 'sent', summary: '单步续聊；复用原连接、模型与最近一轮permissionMode，内部准备并发送，返回202与runId' },
  { id: 'supplement', method: 'POST', path: '/:conversationId/supplement', scope: 'execute', input: 'supplement', output: 'supplemented', summary: '向准确原执行补充输入' },
  { id:'stop-all',method:'POST',path:'/:conversationId/stop-all',scope:'execute',input:'stopAll',output:'conversation',summary:'停止准确对话受理时的全部在途执行与排队输入' },
  { id: 'stop', method: 'POST', path: '/:conversationId/stop', scope: 'execute', input: 'stop', output: 'conversation', summary: '按修订和完整执行身份停止原工作' },
  { id: 'reply', method: 'POST', path: '/:conversationId/requests/:requestId/reply', scope: 'answer', input: 'reply', output: 'conversation', summary: '回答问题需answer；审批需approve，不互相替代' },
];
export function matchPublicOperation(method: string, suffix: string) {
  for (const operation of PROGRAMMATIC_OPERATIONS) {
    if (method !== operation.method) continue;
    const names: string[] = [];
    const pattern = operation.path.replace(/:([A-Za-z]+)/g, (_, name) => { names.push(name); return '([a-f0-9-]{36})'; });
    const matched = suffix.match(new RegExp(`^${pattern}$`));
    if (matched) return { operation, params: Object.fromEntries(names.map((name, index) => [name, matched[index + 1]])) };
  }
  return undefined;
}
