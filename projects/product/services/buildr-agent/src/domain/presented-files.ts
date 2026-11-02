import type { ConversationEntry, PresentedFile } from '../contracts.ts';

/** Declarations identify outputs; they never grant access or prove current existence. */
export function normalizePresentedFiles(value:unknown):PresentedFile[] {
  if(!Array.isArray(value))return [];
  const seen=new Set<string>(),files:PresentedFile[]=[];
  for(const item of value.slice(0,20)){
    if(!item||typeof item.path!=='string'||!item.path.trim()||item.path.length>8192||/[\0\r\n]/.test(item.path)||seen.has(item.path))continue;
    if(/^[a-z][a-z\d+.-]*:/i.test(item.path)&&!(/^[a-z]:[\\/]/i.test(item.path)))continue;
    seen.add(item.path);
    files.push({path:item.path,...(typeof item.description==='string'&&item.description?{description:item.description.slice(0,2000)}:{})});
  }
  return files;
}

/** Exact native tool protocol, not a match against assistant prose or result text. */
export function dshPresentedFiles(name:unknown,input:unknown):PresentedFile[]|undefined {
  if(name!=='present'||typeof input!=='string')return;
  try{return normalizePresentedFiles(JSON.parse(input)?.files);}catch{return;}
}

export function presentedFilesForEntry(entry:Pick<ConversationEntry,'kind'|'role'|'provider'|'status'|'name'|'input'|'parentToolId'|'runId'|'participantId'|'presentedFiles'>):PresentedFile[] {
  if(entry.status!=='completed'||entry.parentToolId||!entry.runId||!entry.participantId)return [];
  if(entry.presentedFiles!==undefined)return normalizePresentedFiles(entry.presentedFiles);
  return entry.provider==='dsh'&&entry.kind==='tool'&&entry.role==='system'?dshPresentedFiles(entry.name,entry.input)??[]:[];
}
