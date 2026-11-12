import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ExecutorGateway } from '../model-gateway.ts';
import { gatewayEffort, gatewayModel } from '../model-gateway.ts';
import { nativePreview, visibleText } from '../native-process.ts';
import type { ExecutorItem, ExecutorRequest, PresentedFile } from '../../contracts.ts';
import { nativeParticipation } from '../../domain/participation.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';

/** Only native explicit file resource links become cards; assistant prose is not a declaration. */
export function claudePresentedFiles(output:any):PresentedFile[]|undefined {
  const links=output?.resourceLinks??output?.resource_links;
  if(!Array.isArray(links))return;
  const files:PresentedFile[]=[];
  for(const link of links.slice(0,50)){
    if(typeof link?.uri!=='string'||!link.uri.startsWith('file:'))continue;
    try{files.push({path:fileURLToPath(link.uri),...(typeof link.name==='string'?{description:link.name}:{})});}catch{/* Remote hosts and invalid URIs are not local files. */}
  }
  return files.length?files:undefined;
}

/** A UUID identifies an admitted user input, not a model turn or a tool call. */
export function claudeInputId(request: string): string {
  const bytes = createHash('sha256').update('buildr-claude-input:' + request).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** Every native model purpose uses the same restricted lease, including Haiku and subagents. */
export function claudeGatewayEnvironment(gateway: ExecutorGateway): Record<string, string> {
  const model = gatewayModel(gateway);
  return {
    ANTHROPIC_BASE_URL: gateway.baseUrl.replace(/\/v1\/?$/, ''),
    ANTHROPIC_AUTH_TOKEN: gateway.apiKey,
    ANTHROPIC_API_KEY: '',
    CLAUDE_CODE_OAUTH_TOKEN: '',
    CLAUDE_CODE_USE_BEDROCK:'0',
    CLAUDE_CODE_USE_VERTEX:'0',
    CLAUDE_CODE_USE_FOUNDRY:'0',
    ANTHROPIC_MODEL: model.id,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model.id,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model.id,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model.id,
    ANTHROPIC_DEFAULT_FABLE_MODEL: model.id,
    ANTHROPIC_SMALL_FAST_MODEL: model.id,
    CLAUDE_CODE_SUBAGENT_MODEL: model.id,
    CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL: model.id,
    ...(model.contextWindow ? {CLAUDE_CODE_MAX_CONTEXT_TOKENS:String(model.contextWindow)} : {}),
    ENABLE_TOOL_SEARCH: 'false',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    CLAUDE_CODE_DISABLE_AUTO_UPDATE: '1',
    CLAUDE_CODE_GATEWAY_HINT_HEADERS:'1',
    DISABLE_AUTOUPDATER: '1',
    ...(model.maxOutputTokens ? { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(Math.min(32000, model.maxOutputTokens)) } : {}),
    NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
  };
}

export function claudeEffort(gateway: ExecutorGateway, selected?: string, effort?: string): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined {
  const value = gatewayEffort(gateway, selected, effort);
  if (!value) return;
  if (!['low','medium','high','xhigh','max'].includes(value)) throw new AgentServiceError('agent_claude_reasoning_unavailable','Claude Agent 尚不支持所选思考档位，请选择该模型支持的 low、medium、high、xhigh 或 max。',409);
  return value as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** Exact native content-block identities are shared by live events and transcript reads. */
export function claudeItems(row: any, executionId?: string, blockOffset=0): ExecutorItem[] {
  const role = row.type === 'assistant' ? 'assistant' : row.type === 'user' ? 'user' : undefined;
  if (!role) return [];
  const message = row.message ?? {};
  const parts = Array.isArray(message.content) ? message.content : typeof message.content === 'string' ? [{type:'text',text:message.content}] : [];
  const parentToolId = typeof row.parent_tool_use_id === 'string' ? row.parent_tool_use_id : undefined;
  const messageId = message.id ?? row.uuid;
  if (typeof messageId !== 'string') return [];
  return parts.flatMap((part: any, index: number): ExecutorItem[] => {
    const common:Pick<ExecutorItem,'role'|'executionId'|'parentToolId'> = { role, executionId, ...(parentToolId ? { parentToolId } : {}) };
    if (part.type === 'tool_use' && typeof part.id === 'string') return [{
      ...common, id: part.id, kind: 'tool', name: part.name,
      input: nativePreview(JSON.stringify(part.input ?? {})), text: '', status: 'running', nativeTool: true,
      participation:nativeParticipation(JSON.stringify(part.input??{}),undefined,'pending'),
    }];
    if (part.type === 'tool_result' && typeof part.tool_use_id === 'string') return [{
      ...common, role: 'assistant', id: part.tool_use_id, kind: 'tool',
      text: nativePreview(visibleText(part.content)), status: row.tool_use_result?.detachedToolCall || row.toolUseResult?.detachedToolCall ? 'running' : part.is_error ? 'failed' : 'completed', nativeTool: true,
      ...(!part.is_error?{presentedFiles:claudePresentedFiles(row.tool_use_result??row.toolUseResult)}:{}),
      participation:nativeParticipation(undefined,visibleText(part.content),part.is_error?'failed':'unknown'),
    }];
    if (part.type === 'thinking' && typeof part.thinking === 'string') return [{
      ...common, id: `message:${messageId}:${index+blockOffset}`, kind: 'thinking', thinking: true, text: part.thinking, status: 'completed',
    }];
    if (part.type === 'text' && typeof part.text === 'string' && part.text) return [{
      ...common, id: role === 'user' && !parentToolId ? row.uuid ?? messageId : `message:${messageId}:${index+blockOffset}`,
      kind: 'message', text: part.text, status: 'completed',
    }];
    // Signatures and encrypted/redacted thinking are never rendered or migrated.
    return [];
  });
}

/** Claude emits one complete assistant frame per block, all sharing message.id.
 * Carry offsets across pages; repeated observations of a UUID retain its ID. */
export class ClaudeItemProjector {
  private readonly messages=new Map<string,{next:number;rows:Map<string,number>}>();
  items(row:any,executionId?:string):ExecutorItem[]{
    if(row.type!=='assistant'||!row.message?.id)return claudeItems(row,executionId);
    const key=String(row.message.id),state=this.messages.get(key)??{next:0,rows:new Map<string,number>()};
    const uuid=String(row.uuid??key),old=state.rows.get(uuid),offset=old??state.next;
    if(old===undefined){state.rows.set(uuid,offset);state.next+=Array.isArray(row.message.content)?row.message.content.length:1;}
    this.messages.set(key,state);
    return claudeItems(row,executionId,offset);
  }
}

export function claudeQuestion(id: string, input: Record<string, unknown>, parentToolId?: string): ExecutorRequest {
  const raw = Array.isArray(input.questions) ? input.questions as any[] : [];
  if (!raw.length || raw.length > 4) throw new Error('agent_question_invalid');
  return {
    id, kind: 'question', blocking: true, title: '需要你的决定',
    ...(parentToolId ? { parentToolId } : {}),
    questions: raw.map((q, index) => ({
      id: String(index), label: String(q.question ?? q.header ?? ''),
      multiple: q.multiSelect === true, allowOther: true,
      options: (Array.isArray(q.options) ? q.options : []).map((o: any, i: number) => ({
        id: String(o.label ?? i), label: String(o.label ?? ''), description: typeof o.description === 'string' ? o.description : undefined,
      })),
    })),
  };
}

/** Answers are only accepted in the original request's declared option space. */
export function claudeAnswers(request: ExecutorRequest, input: Record<string, unknown>, answer: unknown): Record<string, unknown> {
  const result: Record<string, string> = {};
  const raw = (input.questions as any[]) ?? [];
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('agent_question_answer_invalid');
  const value = answer as Record<string, unknown>;
  if (Object.keys(value).length !== request.questions?.length) throw new Error('agent_question_answer_invalid');
  for (const q of request.questions ?? []) {
    const selected = value[q.id];
    const labels = Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : [];
    if (!labels.length || labels.some(label => typeof label !== 'string' || !label.trim()) || !q.multiple && labels.length !== 1) throw new Error('agent_question_answer_invalid');
    result[String(raw[Number(q.id)]?.question ?? '')] = labels.join(', ');
  }
  return { ...input, answers: result };
}
