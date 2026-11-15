import type {CodeCatalog} from '../code/api/code-api';
function normalizedPath(value:string):string|null {
  if(!value||/[\0\r\n]/.test(value)||/^[a-z][a-z\d+.-]*:\/\//i.test(value))return null;
  const normalized=value.replace(/\\/g,'/');
  const prefix=/^[a-z]:\//i.test(normalized)?normalized.slice(0,2).toLowerCase():normalized.startsWith('/')?'':null;
  if(prefix===null)return null;
  const parts:string[]=[];
  for(const part of normalized.slice(prefix.length).split('/')){
    if(part==='..'){if(!parts.length)return null;parts.pop();}
    else if(part&&part!=='.')parts.push(part);
  }
  return prefix+'/'+parts.join('/');
}
/** Resolve the actual checkout containing the invocation target. Never use a
 * task/default checkout as a fallback for a missing or ambiguous source. */
export function conversationFileTarget(cwd:string,path:string,catalog:Pick<CodeCatalog,'worktrees'>):{repositoryId:string;checkoutId:string;path:string}|null {
  // Parent traversal and home expansion depend on executor-side resolution.
  if(/(^|[\\/])\.\.([\\/]|$)/.test(path)||/^~(?:[\\/]|$)/.test(path))return null;
  if(/^[a-z][a-z\d+.-]*:/i.test(path)&&!(/^[a-z]:[\\/]/i.test(path)))return null;
  const absolute=normalizedPath(/^(?:[\\/]|[a-z]:[\\/])/i.test(path)?path:cwd+'/'+path);
  if(!absolute)return null;
  const candidates=catalog.worktrees.flatMap(member=>{
    const root=normalizedPath(member.path)?.replace(/\/$/,'');
    return root&&absolute.startsWith(root+'/')?[{member,root}]:[];
  }).sort((left,right)=>right.root.length-left.root.length);
  const first=candidates[0];
  if(!first||!first.member.available||candidates[1]?.root.length===first.root.length)return null;
  return {repositoryId:first.member.repositoryId,checkoutId:first.member.id,path:absolute.slice(first.root.length+1)};
}
