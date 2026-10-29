import type { AgentConversationsClient } from './api/agent-conversations-api';
import { firstConversationSubmissions, type FirstSubmission } from './conversation-first-submission.ts';
import { supportsConversationPermission, type ConversationChoice, type PermissionMode } from './conversation-options.ts';
import { preferredConversationChoice, rememberedConversationPermission, type ConversationModelPreference, type ConversationModulePreference } from './conversation-preferences.ts';
import type { CatalogModel, ConnectionView, ConversationView } from './types';

export type ConversationProductActionSelection = {
  choice: ConversationChoice;
  permissionMode: PermissionMode;
};

export type ConversationProductActionResult =
  | { status: 'started'; conversation: ConversationView }
  | { status: 'recovering'; reason: 'existing-submission' | 'submission-unknown'; conversation?: ConversationView };

type Submissions = ReturnType<typeof firstConversationSubmissions>;

/** 核对原提交不依赖当前连接或模型目录，避免连接离线后误退回复制。 */
export async function recoverConversationProductAction(client: AgentConversationsClient, submissions: Submissions): Promise<ConversationProductActionResult | null> {
  const existing = submissions.read();
  if (!existing) return null;
  const observed = await client.lookupDraft(existing.workspaceId, existing.draftId, existing.input.clientRequestId).catch(() => null);
  if (observed?.found && observed.conversation) submissions.clear(existing.input.clientRequestId);
  return {
    status: 'recovering',
    reason: 'existing-submission',
    ...(observed?.found && observed.conversation ? { conversation: observed.conversation } : {}),
  };
}

/** 产品动作只从当前可用连接恢复新对话选择，不让失效偏好阻塞其他就绪入口。 */
export function conversationProductActionSelection(
  workspaceId: string,
  modulePreference: ConversationModulePreference,
  modelPreference: ConversationModelPreference | null,
  connections: ConnectionView[],
  catalog: CatalogModel[],
): ConversationProductActionSelection | null {
  const available = connections.filter(connection => connection.enabled && connection.status === 'ready');
  const choice = preferredConversationChoice(modulePreference, modelPreference, available, catalog);
  const connection = available.find(item => item.id === choice?.connectionId);
  if (!choice || !connection) return null;
  const permissionMode = rememberedConversationPermission(modulePreference, workspaceId);
  return supportsConversationPermission(connection, permissionMode) ? { choice, permissionMode } : null;
}

/**
 * 与手工首条发送共用提交记录。已有或未知提交先核对，绝不覆盖身份后再发一次。
 * 网络读取在真正调用 startDraft 前失败时仍会抛出，调用方可以安全选择其他交接方式。
 */
export async function startConversationProductAction({
  client,
  input,
  selection,
  submissions,
  uuid = () => crypto.randomUUID(),
}: {
  client: AgentConversationsClient;
  input: { workspaceId: string; cwd: string; text: string };
  selection: ConversationProductActionSelection;
  submissions: Submissions;
  uuid?: () => string;
}): Promise<ConversationProductActionResult> {
  const recovered = await recoverConversationProductAction(client, submissions);
  if (recovered) return recovered;

  const draftId = uuid();
  const snapshot = await client.draftImages(draftId);
  // 手工发送可能在草稿读取期间保存了身份；不得覆盖它。
  const concurrent = await recoverConversationProductAction(client, submissions);
  if (concurrent) return concurrent;
  const submitted: FirstSubmission = {
    draftId,
    workspaceId: input.workspaceId,
    input: {
      ...selection.choice,
      permissionMode: selection.permissionMode,
      text: input.text,
      attachmentIds: [],
      expectedDraftRevision: snapshot.revision,
      clientRequestId: uuid(),
      cwd: input.cwd,
    },
  };
  submissions.save(submitted);
  try {
    const result = await client.startDraft(submitted.workspaceId, submitted.draftId, submitted.input);
    submissions.clear(submitted.input.clientRequestId);
    return { status: 'started', conversation: result.conversation };
  } catch (failure) {
    const error = failure as { status?: number; code?: string };
    // 明确的请求拒绝证明没有受理；其他错误必须先查询原提交。
    if (error.status && error.status < 500 && error.code !== 'agent_request_conflict') {
      submissions.clear(submitted.input.clientRequestId);
      throw failure;
    }
    const observed = await client.lookupDraft(submitted.workspaceId, submitted.draftId, submitted.input.clientRequestId).catch(() => null);
    if (observed?.found && observed.conversation) {
      submissions.clear(submitted.input.clientRequestId);
      return { status: 'started', conversation: observed.conversation };
    }
    return { status: 'recovering', reason: 'submission-unknown' };
  }
}
