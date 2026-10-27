import type {ConversationChoice} from '../../features/agent-conversations/conversation-options';
import {models} from './fixtures';

export type ExecutionChange={kind:'agent'|'model';label:string;before:string;after:string};
const agents:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
export function modelLabel(choice:ConversationChoice):string{return models.find(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model)?.label??choice.model??'原模型';}
export function executionChanges(previous:ConversationChoice,next:ConversationChoice):ExecutionChange[]{
 const changes:ExecutionChange[]=[];
 if(previous.connectionId!==next.connectionId)changes.push({kind:'agent',label:'智能体',before:agents[previous.connectionId],after:agents[next.connectionId]});
 if(previous.model!==next.model||previous.modelAccountId!==next.modelAccountId)changes.push({kind:'model',label:'模型',before:modelLabel(previous),after:modelLabel(next)});
 return changes;
}
export function changeNotice(changes:ExecutionChange[],received=false):string{
 const agent=changes.find(change=>change.kind==='agent'),model=changes.find(change=>change.kind==='model');
 if(received){if(!agent&&model)return `已改用 ${model.after}`;return [agent?.after,model?.after].filter(Boolean).join(' · ')+' 已接手';}
 if(agent&&model)return `接下来由 ${agent.after} · ${model.after} 继续处理`;
 if(agent)return `接下来由 ${agent.after} 继续处理`;
 if(model)return `接下来使用 ${model.after} 继续处理`;
 return '';
}
