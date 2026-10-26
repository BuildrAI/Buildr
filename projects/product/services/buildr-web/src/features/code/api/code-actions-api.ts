import { api, LocalSessionAdapter } from '../../../api';
import type { SessionAdapter } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { CodeDiscardContextDiscardContext, CodeDiscardChangesDiscardChanges, CodeCommitContextCommitContext, CodeGitMutationResultCommitChanges, CodePushResultPush } from '../../../../build/generated/code-http-dto';

import type { CodeCommitMessageRunRun } from '../../../../build/generated/code-generation-http-dto';

export type GenerationRun = CodeCommitMessageRunRun;
export type ModelSelection = {id:string;label:string;modelAccountId:string;modelId:string;accountIdentity:string;accountRevision:string;serviceTier?:string};
export type CommitContext = CodeCommitContextCommitContext;
export type GitMutationResult = CodeGitMutationResultCommitChanges;
export type CodeActionSource = { workspaceId: string; repositoryId: string; worktreeId: string; branch: string | null };
export type CommitMode = 'commit' | 'commit-sync' | 'commit-push';
export type PushRetry = NonNullable<GitMutationResult['push']['retry']>;
export function createCodeActionsClient(client: ApiClient, session?: Pick<SessionAdapter,'writeHeaders'>) {
  const resource = (source: CodeActionSource, operation: string) => `/api/v1/workspaces/${encodeURIComponent(source.workspaceId)}/code/${operation}`;
  const location = (source: CodeActionSource) => ({repositoryId: source.repositoryId, worktreeId: source.worktreeId});
  return {
    context(source: CodeActionSource, signal?: AbortSignal): Promise<CommitContext> { return client(resource(source, 'commit-context') + '?' + new URLSearchParams(location(source)), {signal}) as Promise<CommitContext>; },
    generate(source: CodeActionSource, expectedRevision: string, model: ModelSelection): Promise<CodeCommitMessageRunRun> { return client(resource(source, 'commit-message'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, modelAccountId:model.modelAccountId,modelId:model.modelId,accountIdentity:model.accountIdentity,accountRevision:model.accountRevision,label:model.label,serviceTier:model.serviceTier})}) as Promise<CodeCommitMessageRunRun>; },
    commit(source: CodeActionSource, expectedRevision: string, message: string, mode: CommitMode): Promise<GitMutationResult> { return client(resource(source, 'commit-changes'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, message, mode})}) as Promise<GitMutationResult>; },
    push(source: CodeActionSource, retry: PushRetry): Promise<CodePushResultPush> { return client(resource(source, 'push'), {method: 'POST', body: JSON.stringify({...location(source), ...retry})}) as Promise<CodePushResultPush>; },
    discardContext(source: CodeActionSource, path?: string): Promise<CodeDiscardContextDiscardContext> { return client(resource(source, 'discard-context') + '?' + new URLSearchParams({...location(source), ...(path === undefined ? {} : {filePath: path})})) as Promise<CodeDiscardContextDiscardContext>; },
    discard(source: CodeActionSource, expectedRevision: string, path?: string): Promise<CodeDiscardChangesDiscardChanges> { return client(resource(source, 'discard-changes'), {method: 'POST', body: JSON.stringify({...location(source), expectedRevision, ...(path === undefined ? {} : {path})})}) as Promise<CodeDiscardChangesDiscardChanges>; },
    run(source:CodeActionSource,runId:string):Promise<GenerationRun>{return client(resource(source,'commit-message-runs')+'?'+new URLSearchParams({runId}),{headers:session?.writeHeaders()}) as Promise<GenerationRun>;},
    cancel(source:CodeActionSource,runId:string):Promise<GenerationRun>{return client(resource(source,'commit-message-cancel'),{method:'POST',body:JSON.stringify({runId})}) as Promise<GenerationRun>;},
  };
}
export type CodeActionsClient = ReturnType<typeof createCodeActionsClient>;
export const codeActionsApi = createCodeActionsClient(api,new LocalSessionAdapter());
