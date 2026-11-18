/** Public Harness routes. Engineering code only observes conversations and edits their links. */
export function conversationApiPath(workspaceId:string,id?:string):string{
 let base:string;
 if(workspaceId.startsWith('scope:')){
  const ref=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(workspaceId.slice(6).replaceAll('-','+').replaceAll('_','/')),value=>value.charCodeAt(0))));
  if(!Array.isArray(ref)||ref.length!==2||ref.some(value=>typeof value!=='string'||!value))throw new Error('执行范围引用无效。');
  base='/api/v1/harness/sources/'+encodeURIComponent(ref[0])+'/scopes/'+encodeURIComponent(ref[1])+'/conversations';
 }else base=workspaceId==='@default'?'/api/v1/app/agent-service/conversations':'/api/v1/workspaces/'+encodeURIComponent(workspaceId)+'/agent-conversations';
 return base+(id?'/'+encodeURIComponent(id):'');
}
