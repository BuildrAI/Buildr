import {ModelAccessError} from '../model-access/contracts.ts';
import type { ConnectionView, ContextRef, ConversationView, ExecutionRef, RunStatus, RunView } from '../contracts.ts';

export class AgentServiceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message); this.name = 'AgentServiceError'; this.code = code; this.status = status;
  }
}
export function fail(code: string, message: string, status = 400): never { throw new AgentServiceError(code, message, status); }
export function nonempty(value: unknown, label: string, maximum = 1024): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail('agent_input_invalid', `${label}无效。`);
  return value.trim();
}
export function expected(actual: string, supplied: unknown): void {
  if (actual !== supplied) fail('agent_revision_conflict', '内容已变化，请刷新后重试。', 409);
}
export function safeDiagnostic(error: unknown): string {
  // Do not expose raw vendor errors, which can contain headers, URLs or credentials.
  if (error instanceof AgentServiceError || error instanceof ModelAccessError) return error.message;
  const code = error instanceof Error ? error.message.split(':')[0] : '';
  const messages: Record<string, string> = {
    qoder_platform_login_required: 'Qoder 程序需要先完成基础平台登录；不要求购买或选择 Qoder 模型套餐。',
    qoder_platform_login_expired: 'Qoder 基础平台登录已过期，请在智能体程序中重新登录。所选模型套餐保持。',
    qoder_platform_auth_unavailable: '尚未确认 Qoder 基础平台登录，请检查该程序的独立账号。',
    agent_program_missing: '未找到原生程序，请选择已安装程序的准确绝对路径。',
    codex_version_unsupported: '当前接入接受 Codex 0.x.x，包含有效预发布版本，仍需通过实际连接检查。',
    dsh_version_unsupported: '当前接入接受 DSH 0.x.x，包含有效预发布版本，仍需通过实际连接检查。',
    qoder_version_unsupported: '当前接入接受 Qoder CLI 1.x.x，包含有效预发布版本，仍需通过内置 SDK 的实际连接检查。',
    agent_context_binding_mismatch: '原生上下文与当前目录或配置身份不匹配，原记录已保留。',
    codex_event_observation_lost: '本机执行记录暂时未能更新，正在核对原执行；不会重发原指令。',
    codex_execution_observation_lost: 'Codex 执行连接已中断，正在核对原执行；不会重发原指令。',
    agent_native_process_closed: '原生执行连接已关闭，请核对原执行；不会重发原指令。',
    agent_native_timeout: '原生程序响应超时，请重新观察；不会自动重发工作指令。',
    agent_request_stale: '原生问题或授权已失效，请重新观察。',
  };
  return messages[code] ?? '原生智能体连接未完成，请检查程序、独立登录及兼容版本。';
}
export const BUSY_STATES: ReadonlySet<RunStatus> = new Set(['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'tools-active', 'unknown']);

export interface StoredConnection {
  view: ConnectionView;
  bindingIdentity?: string;
  bindingData?: Record<string, unknown>;
}
export interface StoredParticipant {
  modelAccountId?: string; modelAccountIdentity?: string; modelId?: string; serviceTier?:string;modelConfiguration?:string;
  id: string;
  connectionId: string;
  provider: string;
  label: string;
  bindingIdentity: string;
  contextRef?: ContextRef;
  deliveredThrough: number;
}
export interface StoredConversation {
  view: ConversationView;
  interruption?: { runId: string; awaitingUser: boolean; reason?: 'transport'; attempted?: boolean; cancelled?: boolean };
  runOutcomes?: Record<string,Pick<RunView,'status'|'diagnostic'|'model'|'provider'|'updatedAt'>>;
  titleOrigin?: 'default' | 'generated' | 'manual';
  titleAttempted?: boolean;
  participants: StoredParticipant[];
  sources: Record<string, string>;
  attachments: Record<string, { mimeType: string; size: number; createdAt?: string }>;
  attempts: Array<{
    clientRequestId: string;
    inputDigest: string;
    runId: string;
    participantId: string;
    through: number;
    userEntryId: string;
    executionRef?: ExecutionRef;
    nativeInputItemId?: string;
    accepted: boolean;
  }>;
  requests: Record<string, { nativeId: string; executionRef: ExecutionRef }>;
}
