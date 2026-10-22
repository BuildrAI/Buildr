import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import { createAgentOperationsClient } from '../../agents/api/agent-operations-api';
import type { CodeDiscardContextDiscardContext, CodeDiscardChangesDiscardChanges, CodeCommitContextCommitContext, CodeGitMutationResultCommitChanges, CodePushResultPush } from '../../../../build/generated/code-http-dto';

import type { CodeCommitMessageRunRun } from '../../../../build/generated/code-generation-http-dto';

export type CommitContext = CodeCommitContextCommitContext;
export type GitMutationResult = CodeGitMutationResultCommitChanges;
export type CodeActionSource = { workspaceId: string; repositoryId: string; worktreeId: string; branch: string | null };
export type CommitMode = 'commit' | 'commit-sync' | 'commit-push';
export type PushRetry = NonNullable<GitMutationResult['push']['retry']>;
export function createCodeActionsClient(client: ApiClient) {
  const agents = createAgentOperationsClient(client);
  const resource = (source: CodeActionSource, operation: string) => `/api/v1/workspaces/${encodeURIComponent(source.workspaceId)}/code/${operation}`;
  const location = (source: CodeActionSource) => ({repositoryId: source.repositoryId, worktreeId: source.worktreeId});
  return {
    context(source: CodeActionSource, signal?: AbortSignal): Promise<CommitContext> { return client(resource(source, 'commit-context') + '?' + new URLSearchParams(location(source)), {signal}) as Promise<CommitContext>; },
    generate(source: CodeActionSource, expectedRevision: string, agentId: string): Promise<CodeCommitMessageRunRun> { return client(resource(source, 'commit-message'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, agentId})}) as Promise<CodeCommitMessageRunRun>; },
    commit(source: CodeActionSource, expectedRevision: string, message: string, mode: CommitMode): Promise<GitMutationResult> { return client(resource(source, 'commit-changes'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, message, mode})}) as Promise<GitMutationResult>; },
    push(source: CodeActionSource, retry: PushRetry): Promise<CodePushResultPush> { return client(resource(source, 'push'), {method: 'POST', body: JSON.stringify({...location(source), ...retry})}) as Promise<CodePushResultPush>; },
    discardContext(source: CodeActionSource, path?: string): Promise<CodeDiscardContextDiscardContext> { return client(resource(source, 'discard-context') + '?' + new URLSearchParams({...location(source), ...(path === undefined ? {} : {filePath: path})})) as Promise<CodeDiscardContextDiscardContext>; },
    discard(source: CodeActionSource, expectedRevision: string, path?: string): Promise<CodeDiscardChangesDiscardChanges> { return client(resource(source, 'discard-changes'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, ...(path === undefined ? {} : {path})})}) as Promise<CodeDiscardChangesDiscardChanges>; },
    run: agents.run,
    cancel: agents.cancel,
  };
}
export type CodeActionsClient = ReturnType<typeof createCodeActionsClient>;
export const codeActionsApi = createCodeActionsClient(api);
