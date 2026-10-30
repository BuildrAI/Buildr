import {ModelAccessError} from '../model-access/contracts.ts';
import { qoderLoginExpiredMessage } from '../model-access/providers/qoder-auth.ts';
import { NativeObservationError, NativeRequestError } from './error-diagnostic.ts';
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
  if (error instanceof NativeRequestError) return error.diagnostic;
  const code = error instanceof Error ? error.message.split(':')[0] : '';
  const messages: Record<string, string> = {
    qoder_platform_login_required: 'Qoder 程序需要先完成基础平台登录；不要求购买或选择 Qoder 模型套餐。',
    qoder_platform_login_expired: qoderLoginExpiredMessage,
    qoder_platform_auth_unavailable: 'Qoder 账号检查未完成，请检查网络或程序连接后重试；当前不能确定登录是否失效。',
    qoder_gateway_model_unavailable: '当前 Qoder 接入未开放所选外部模型通道，本次模型调用未发出。请改选可用组合；原模型来源与输入已保留。',
    qoder_native_model_unavailable: '所选模型不在 Qoder 当前原生模型目录中，本次模型调用未发出。请刷新账号模型后核对选择；原输入已保留。',
    qoder_native_account_changed: 'Qoder 登录账号已变化，未发送工作指令。请刷新账号后核对原模型来源；原输入已保留。',
    agent_program_missing: '未找到原生程序，请选择已安装程序的准确绝对路径。',
    codex_version_unsupported: '当前接入接受 Codex 0.x.x，包含有效预发布版本，仍需通过实际连接检查。',
    dsh_version_unsupported: '当前接入接受 DSH 0.x.x，包含有效预发布版本，仍需通过实际连接检查。',
    qoder_version_unsupported: '当前接入接受 Qoder CLI 1.x.x，包含有效预发布版本，仍需通过内置 SDK 的实际连接检查。',
    agent_context_binding_mismatch: '原生上下文与当前目录或配置身份不匹配，原记录已保留。',
    codex_event_observation_lost: '本机执行记录暂时未能更新，正在核对原执行；不会重发原指令。',
    codex_execution_observation_lost: 'Codex 执行连接已中断，正在核对原执行；不会重发原指令。',
    dsh_execution_observation_lost: 'DSH 执行观察已中断，正在恢复原执行的进度；不会重发原指令。',
    dsh_event_observation_lost: 'DSH 本机执行记录暂时未能更新，正在核对原执行；不会重发原指令。',
    qoder_execution_observation_lost: 'Qoder 执行连接已中断，正在核对原执行；不会重发原指令。',
    qoder_event_observation_lost: 'Qoder 本机执行记录暂时未能更新，正在核对原执行；不会重发原指令。',
    agent_native_process_closed: '原生执行连接已关闭，请核对原执行；不会重发原指令。',
    agent_native_timeout: '原生程序响应超时，请重新观察；不会自动重发工作指令。',
    agent_native_request_failed: '原生程序拒绝本次请求，未返回具体原因；原输入已保留。',
    agent_native_process_failed: '原生执行程序暂时无法启动，原输入已保留。',
    agent_request_stale: '原生问题或授权已失效，请重新观察。',
  };
  const message = messages[code] ?? '原生执行未能完成，原输入与工作记录已保留，请核对程序连接状态后重试。';
  return error instanceof NativeObservationError && error.diagnostic ? message + ' 原因：' + error.diagnostic : message;
}
export const BUSY_STATES: ReadonlySet<RunStatus> = new Set(['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'tools-active', 'unknown']);

export interface StoredConnection {
  programSource?: string;
  view: ConnectionView;
  bindingIdentity?: string;
  bindingData?: Record<string, unknown>;
}
export interface StoredParticipant {
  historical?: boolean;
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
  forkRequest?: { digest: string; clientRequestId: string };
  /** Immutable, visible source records, separate from this conversation's own messages. */
  inheritedContext?: {
    entries: import('../contracts.ts').ConversationEntry[];
    outcomes: NonNullable<StoredConversation['runOutcomes']>;
    pendingQuestions: string[];
  };
  initialDraft?: { id: string; requestId: string; digest: string };
  view: ConversationView;
  hostScope?: import('../execution-contracts.ts').ExecutionScope;
  interruption?: { runId: string; awaitingUser: boolean; reason?: 'transport'; attempted?: boolean; cancelled?: boolean };
  runOutcomes?: Record<string,Pick<RunView,'status'|'diagnostic'|'model'|'provider'|'updatedAt'>>;
  titleOrigin?: 'default' | 'generated' | 'manual';
  titleAttempted?: boolean;
  earlyTitleAttempted?: boolean;
  titleAttemptsByParticipant?: Record<string,{early?:boolean;completion?:boolean}>;
  titleDiagnostics?: Array<{runId:string;phase:'early'|'completion'|'manual';code:string;reason:string;at:string}>;
  participants: StoredParticipant[];
  sources: Record<string, string>;
  attachments: Record<string, { mimeType: string; size: number; createdAt?: string; video?: import('../contracts.ts').VideoAttachment }>;
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
    supplement?: boolean;
    automaticRetry?: { rootRunId: string; count: number };
    continuationOf?: string;
  }>;
  requests: Record<string, { nativeId: string; executionRef: ExecutionRef }>;
}
