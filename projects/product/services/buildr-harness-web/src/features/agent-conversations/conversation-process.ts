import type { ConversationEntry } from './types.ts';

export type ProcessToolKind = 'command'|'read'|'write'|'edit'|'search'|'fetch'|'directory'|'image'|'tool';
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
    ['edit','edit_file','editfile','file-change','apply_patch','multiedit'].includes(name)?'edit':['grep','glob','web_search','search'].includes(name)?'search':
    ['web_fetch','web_fetch_url'].includes(name)?'fetch':name==='ls'?'directory':['view-image','view_image','imageview'].includes(name)?'image':'tool';
  const path=['read','write','edit'].includes(kind)?stringField(args,'file_path','filePath','path'):undefined;
  const paths=path?[path]:name==='file-change'?entry.text.split('\n').slice(1).map(value=>value.trim()).filter(Boolean):[];
  const command=kind==='command'?(stringField(args,'command','cmd')||entry.input||headline):undefined;
  const commandPreview=command?.split('\n',1)[0].replace(/^\/\S*\/(?:zsh|bash|sh)\s+-lc\s+(['"])(.*)\1$/,'$2');
  let output=entry.text;
  if(command&&output.startsWith(command))output=output.slice(command.length).replace(/^\n/,'');
  else if(entry.input&&output===`${entry.name}\n${entry.input}`)output='';
  const action={command:'运行命令',read:'读取文件',write:'写入文件',edit:'编辑文件',search:'搜索',fetch:'获取网页',directory:'查看目录',image:'查看图片',tool:entry.name||'调用工具'}[kind];
  const imagePath=kind==='image'?stringField(args,'file_path','filePath','path'):undefined;
  const description=paths.length?paths[0].split(/[\\/]/).at(-1)+(paths.length>1?` 等 ${paths.length} 个文件`:''):
    imagePath?imagePath.split(/[\\/]/).at(-1)!:commandPreview||stringField(args,'pattern','query','url')||(kind==='image'&&headline===action?'':headline);
  return {kind,action,description,paths,command,input:entry.input,output};
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
