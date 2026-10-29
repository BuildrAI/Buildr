import type {ConversationView} from './types';

export function mergeChildConversations(previous:ConversationView[],incoming:ConversationView[]):ConversationView[] {
  const rows=new Map(previous.map(row=>[row.id,row]));
  for(const row of incoming)rows.set(row.id,row);
  return [...rows.values()].sort((a,b)=>(a.childOf?.createdAt??a.updatedAt).localeCompare(b.childOf?.createdAt??b.updatedAt)||a.id.localeCompare(b.id));
}
export function childConversationStatus(chat:ConversationView):string {
  const status=chat.run?.status;
  if(status==='waiting-approval')return '等待授权';
  if(status==='waiting-question')return '等待回答';
  if(status==='unknown'||status==='tools-active')return '待核对';
  if(status==='starting'||status==='running'||status==='stopping')return status==='stopping'?'正在停止':'正在处理';
  if(chat.activity&&chat.activity.version>chat.activity.seenThrough)return '有新消息';
  if(status==='failed')return '执行失败';
  return status==='completed'?'已答复':status==='stopped'?'已停止':'尚未开始';
}
export function childCreationStorageKey(parent:Pick<ConversationView,'workspaceId'|'id'>,profile:string):string {
  return 'buildr.child-creation:'+profile+':'+parent.workspaceId+':'+parent.id;
}
export type ChildCreation={expectedRevision:string;clientRequestId:string};
export function readChildCreation(storage:Pick<Storage,'getItem'>|undefined,key:string):ChildCreation|undefined {
  try {
    const value=JSON.parse(storage?.getItem(key)??'null');
    if(typeof value?.expectedRevision==='string'&&value.expectedRevision&&typeof value?.clientRequestId==='string'&&value.clientRequestId)
      return {expectedRevision:value.expectedRevision,clientRequestId:value.clientRequestId};
  }catch{/* A current-page attempt still remains usable. */}
}
