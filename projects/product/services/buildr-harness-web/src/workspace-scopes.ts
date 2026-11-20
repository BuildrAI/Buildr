type ScopeRef = {sourceId:string;id:string};
export function scopeDisplayName(scope:{ref:ScopeRef;name?:string;authority:string}, rootPath?:string):string {
  if(scope.name?.trim())return scope.name;
  if(rootPath)return rootPath.split(/[\\/]/).filter(Boolean).at(-1)||rootPath;
  if(scope.ref.sourceId==='buildr'&&scope.ref.id==='@default')return '默认工作空间';
  return `${scope.ref.sourceId} / ${scope.ref.id}${scope.authority==='offline'?'（来源离线）':''}`;
}

export const workspaceScopeKey=(ref:{sourceId:string;id:string})=>'scope:'+btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([ref.sourceId,ref.id])))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
