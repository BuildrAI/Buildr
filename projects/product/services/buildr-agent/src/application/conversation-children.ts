import {createHash} from 'node:crypto';
import type {ConversationView} from '../contracts.ts';
import {AgentServiceError,expected,fail,nonempty,type StoredConversation} from '../domain/agent-state.ts';
import {handoffEntries} from '../domain/handoff-material.ts';
import type {ConversationRepository} from '../persistence/conversation-repository.ts';
import type {ConversationAttachments} from './conversation-attachments.ts';

export interface CreateChildInput { expectedRevision: string; clientRequestId: string }

/** Background and relation ownership only; creating a child never touches an executor. */
export class ConversationChildren {
  private readonly options: {
    repository: ConversationRepository; media: ConversationAttachments; now(): string;
    load(scope: string,id: string): StoredConversation;
    candidate(scope: string,input: {cwd: string;taskId?: string}): Promise<StoredConversation>;
    save(record: StoredConversation): void;
    view(record: StoredConversation): ConversationView;
  };
  constructor(options: ConversationChildren['options']) { this.options=options; }

  async create(scope: string,parentId: string,input: CreateChildInput): Promise<ConversationView> {
    nonempty(input.expectedRevision,'来源版本',200);
    const requestId=nonempty(input.clientRequestId,'创建请求身份',200);
    const bytes=createHash('sha256').update(JSON.stringify(['child',scope,parentId,requestId])).digest().subarray(0,16);
    bytes[6]=(bytes[6]!&0x0f)|0x40; bytes[8]=(bytes[8]!&0x3f)|0x80;
    const hex=bytes.toString('hex'),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    // Check the source scope even for a replay; a matching request is not a new permission.
    const parent=this.options.load(scope,parentId);
    const repeated=()=>{
      const stored=this.options.repository.readConversation(id);
      if (!stored) return;
      const origin=stored.view.childOf;
      if (stored.view.workspaceId!==scope || origin?.conversationId!==parentId || origin.sourceRevision!==input.expectedRevision)
        fail('agent_request_conflict','相同创建请求对应不同来源，请核对原子对话。',409);
      return this.options.view(stored);
    };
    const previous=repeated(); if(previous)return previous;
    expected(parent.view.revision,input.expectedRevision);
    // The repository read is the snapshot. Awaiting host checks must not reread a newer parent.
    const entries=structuredClone(handoffEntries([...(parent.inheritedContext?.entries??[]),...parent.view.entries]));
    const outcomes=structuredClone({...parent.inheritedContext?.outcomes,...parent.runOutcomes,
      ...(parent.view.run?{[parent.view.run.id]:{status:parent.view.run.status,diagnostic:parent.view.run.diagnostic,model:parent.view.run.model,provider:parent.view.run.provider,updatedAt:parent.view.run.updatedAt}}:{})});
    const pendingQuestions=[...(parent.inheritedContext?.pendingQuestions??[]),...parent.view.requests.map(request=>JSON.stringify({kind:request.kind,title:request.title,description:request.description,questions:request.questions,options:request.options}))];
    const candidate=await this.options.candidate(scope,{cwd:parent.view.cwd,taskId:parent.view.taskId});
    candidate.view.id=id;
    candidate.view.childOf={conversationId:parentId,workspaceId:scope,title:parent.view.title,sourceRevision:parent.view.revision,
      throughSequence:parent.view.entries.at(-1)?.sequence??parent.view.childOf?.throughSequence??0,createdAt:this.options.now(),
      ...(parent.view.run?{state:parent.view.run.status}:{})};
    candidate.inheritedContext={entries,outcomes,pendingQuestions};
    this.options.media.inherit(parent,candidate,[...new Set(entries.flatMap(entry=>entry.attachments??[]))]);
    try { this.options.save(candidate); }
    catch(error) {
      if(error instanceof AgentServiceError && error.code==='agent_revision_conflict') {
        const existing=repeated(); if(existing)return existing;
      }
      throw error;
    }
    return this.options.view(candidate);
  }
}
