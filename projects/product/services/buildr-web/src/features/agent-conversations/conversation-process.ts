import type { ConversationEntry } from './types';
import type { CodeCatalog } from '../code/api/code-api';

export type ProcessToolKind = 'command'|'read'|'write'|'edit'|'search'|'fetch'|'directory'|'tool';
export type ProcessTool = {kind:ProcessToolKind;action:string;description:string;paths:string[];command?:string;input?:string;output:string};
const shell=/^(?:\/\S*\/)?(?:zsh|bash|sh|pwsh|powershell|cmd)(?:\.exe)?(?:\s|$)/i;
function argumentsOf(entry:ConversationEntry):Record<string,unknown> {
  // Output may itself be JSON. Only explicit invocation input is authoritative.
  const raw=entry.input;
  if(raw===undefined)return {};
  try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
const stringField=(args:Record<string,unknown>,...keys:string[])=>keys.map(key=>args[key]).find((value):value is string=>typeof value==='string'&&Boolean(value.trim()));
export function processTool(entry:ConversationEntry):ProcessTool {
  const name=(entry.name||'').trim().toLowerCase();
  const args=argumentsOf(entry),headline=entry.text.split('\n',1)[0].trim();
  const kind:ProcessToolKind=['command','commandexecution','bash','shell','exec_command'].includes(name)||!name&&shell.test(headline)?'command':
    ['read','read_file','readfile'].includes(name)?'read':['write','write_file','writefile'].includes(name)?'write':
    ['edit','edit_file','file-change'].includes(name)?'edit':['grep','glob','web_search','search'].includes(name)?'search':
    ['web_fetch','web_fetch_url'].includes(name)?'fetch':name==='ls'?'directory':'tool';
  const path=['read','write','edit'].includes(kind)?stringField(args,'file_path','filePath','path'):undefined;
  const paths=path?[path]:name==='file-change'?entry.text.split('\n').slice(1).map(value=>value.trim()).filter(Boolean):[];
  const command=kind==='command'?(stringField(args,'command','cmd')||entry.input||headline):undefined;
  const commandPreview=command?.split('\n',1)[0].replace(/^\/\S*\/(?:zsh|bash|sh)\s+-lc\s+(['"])(.*)\1$/,'$2');
  let output=entry.text;
  if(command&&output.startsWith(command))output=output.slice(command.length).replace(/^\n/,'');
  else if(entry.input&&output===`${entry.name}\n${entry.input}`)output='';
  const action={command:'运行命令',read:'读取文件',write:'写入文件',edit:'编辑文件',search:'搜索',fetch:'获取网页',directory:'查看目录',tool:entry.name||'调用工具'}[kind];
  const description=paths.length?paths[0].split(/[\\/]/).at(-1)+(paths.length>1?` 等 ${paths.length} 个文件`:''):
    commandPreview||stringField(args,'pattern','query','url')||headline;
  return {kind,action,description,paths,command,input:entry.input,output};
}
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

/** Citation suffixes are locations, never part of a repository filename. */
export function conversationFileReference(reference:string):{path:string;line?:number}|null {
  let value:string;try{value=decodeURIComponent(reference);}catch{return null;}
  if(!value||/[\0\r\n?]/.test(value)||value.startsWith('//'))return null;
  const hash=value.match(/#L([1-9]\d*)(?:[-:]L?([1-9]\d*))?$/i);
  const colon=!hash?value.match(/:([1-9]\d*)(?::[1-9]\d*)?$/):null;
  const suffix=hash||colon;
  const filename=suffix?value.slice(0,-suffix[0].length):value;
  const line=suffix?Number(suffix[1]):undefined;
  if(filename.includes('#')||line!==undefined&&!Number.isSafeInteger(line))return null;
  return {path:filename,...(line?{line}:{})};
}
