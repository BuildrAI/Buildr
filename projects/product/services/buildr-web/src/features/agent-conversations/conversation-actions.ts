/** UI request ownership; native control identities remain in the HTTP request. */
export function conversationActionKey(scope:{workspaceId:string;conversationId:string},action:string,identity=''):string {
  return JSON.stringify([scope.workspaceId,scope.conversationId,action,identity]);
}
export function createConversationActions(changed:()=>void=()=>{}) {
  const pending=new Set<string>();
  return {
    has:(key:string)=>pending.has(key),
    begin(key:string){if(pending.has(key))return false;pending.add(key);changed();return true;},
    finish(key:string){if(pending.delete(key))changed();},
    move(from:string,to:string){if(from===to)return;pending.delete(from);pending.add(to);changed();},
  };
}
