import { createHash } from 'node:crypto';
import type { ConversationView } from '@buildr-ai/buildr-agent';

type Page = {conversations: ConversationView[]; nextCursor?: string; total?: number; activityCounts?: unknown; stats?: unknown};
/** A transport projection, never an authoritative conversation or control input. */
export function agentActivitySummary(page: Page, pending: unknown[], expectedRevision?: string) {
  const conversations = page.conversations.map(view => ({
    id:view.id,workspaceId:view.workspaceId,cwd:view.cwd,title:view.title,revision:view.revision,hidden:view.hidden,updatedAt:view.updatedAt,
    taskId:view.taskId,taskIds:view.taskIds,taskLinks:view.taskLinks,activity:view.activity,
    participants:[],entries:[],requests:[],
    ...(view.run ? {run:{id:view.run.id,participantId:view.run.participantId,provider:view.run.provider,generation:view.run.generation,
      status:view.run.status,accepted:view.run.accepted,stopRequested:view.run.stopRequested,executionState:view.run.executionState,tools:[],startedAt:view.run.startedAt,updatedAt:view.run.updatedAt,
      model:view.run.model,modelAccountId:view.run.modelAccountId}} : {}),
  }));
  const body = {conversations,pending,nextCursor:page.nextCursor,total:page.total,activityCounts:page.activityCounts,stats:page.stats};
  const revision = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return revision === expectedRevision ? {revision,unchanged:true as const} : {revision,...body};
}
