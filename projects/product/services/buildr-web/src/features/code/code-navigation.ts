import type { CodeLocation } from './api/code-api';
export type CodeTaskEntry = {
  origin?: 'project' | 'task' | 'source-control';
  taskId?:string; taskTitle?:string;
  file?:{gitRepositoryId?:string;repositoryId?:string;checkoutId?:string;path:string;commitHash?:string;line?:number};
  from:{pathname:string;search:string;hash:string;state:unknown};
};
export type CodeFileTab = CodeLocation & {key:string;path:string;line?:number;focusRequest?:number;matchQuery?:string};
export const codeLocationKey=(value:CodeLocation)=>JSON.stringify([value.repositoryId,value.checkoutId||'',value.checkoutId?'':value.taskId||'',value.commitHash||'']);
export const codeCheckoutKey=(value:CodeLocation)=>codeLocationKey({...value,commitHash:undefined});
// Tree identifiers stay opaque to the shared browser; requests retain the real repository identity.
export const codeBrowserKey=(value:CodeLocation)=>encodeURIComponent(codeLocationKey(value));
export const codeFileKey=(value:CodeLocation,path:string)=>codeLocationKey(value)+':'+path;
export function relativeCodeLink(file:string,href:string):string|null {
  if(!href||/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(href))return null;
  let target:string;try{target=decodeURIComponent(href.split(/[?#]/)[0]);}catch{return null;}
  if(!target||/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(target)||/[\\\0]/.test(target))return null;
  const parts=file.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}
  return parts.some(part=>part.toLowerCase()==='.git')?null:parts.join('/');
}

export const canonicalCodeLocation=(value:CodeLocation):CodeLocation=>({repositoryId:value.repositoryId,checkoutId:value.checkoutId,taskId:value.checkoutId?undefined:value.taskId,commitHash:value.commitHash});

// Explicit checkout identity takes priority; legacy task/default entries resolve their source when read.
export function matchesCodeLocation(selection: CodeLocation, observed: CodeLocation & {kind?: string}): boolean {
  return selection.repositoryId === observed.repositoryId && (selection.commitHash || '') === (observed.commitHash || '') &&
    (selection.checkoutId ? selection.checkoutId === observed.checkoutId : observed.kind !== 'worktree' && (selection.taskId || '') === (observed.taskId || ''));
}
export const isTaskReturnPath=(pathname:string,tasksRoot:string)=>pathname===tasksRoot||pathname.startsWith(tasksRoot+'/');

/** The semantic source can be a detail pane hosted on another page's route. */
export function codeReturnTarget(entry: CodeTaskEntry | null | undefined, workspaceRoot: string) {
  workspaceRoot = workspaceRoot.replace(/\/+$/, '');
  const from = entry?.from;
  if (!from || !workspaceRoot || !from.pathname.startsWith(workspaceRoot + '/')) return null;
  let origin = entry.origin;
  if (!origin) {
    // Retain compatibility with entries already present in browser history.
    const state = from.state as { resourceViews?: { active?: string; items?: Array<{ kind: string }> } } | null;
    const active = state?.resourceViews?.items?.find(item => item.kind === state.resourceViews?.active)?.kind;
    if (active === 'task' || active === 'composite-task') origin = 'task';
    else if (active === 'project') origin = 'project';
    else if (isTaskReturnPath(from.pathname, workspaceRoot + '/tasks')) origin = 'task';
    else if (isTaskReturnPath(from.pathname, workspaceRoot + '/projects')) origin = 'project';
    else if (from.pathname === workspaceRoot + '/code/source-control') origin = 'source-control';
  }
  if (!origin) return null;
  const label = { project: '返回项目', task: '返回任务', 'source-control': '返回源代码管理' }[origin];
  return { origin, label, from };
}
