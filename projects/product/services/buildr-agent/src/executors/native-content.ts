import fs from 'node:fs';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import type { ConversationEntry } from '../contracts.ts';
import type { NativeContentContext, NativeContentInventory, NativeContentRecord, NativeContentSource, NativeContentValue, NativeTextPart, NativeToolContent } from '../native-content-contracts.ts';
import { maxNativeSourceBytes, nativeContentHash, nativeContentPath, NativeContentReader, nativeValueText } from '../storage/native-content.ts';
import { safeStoragePath } from '../storage/files.ts';
import { nativePreview } from './native-process.ts';

export interface NativeJsonRow { source: NativeContentSource; value: any }
export function nativeContentFiles(input: NativeContentContext, directory: string, matches: (file: string) => boolean, depth = 5): string[] {
  const result: string[] = []; let visited = 0;
  const walk = (dir: string, remaining: number) => {
    if (++visited > 10000 || !remaining || !safeStoragePath(input.root, dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file, remaining - 1);
      else if (item.isFile() && matches(file)) result.push(file);
    }
  };
  walk(directory, depth); return visited > 10000 ? [] : result;
}

/** Preserve byte offsets and exact compressed frames; no new native files or SDK processes. */
export function nativeContentRows(input: NativeContentContext, provider: string, file: string): NativeJsonRow[] {
  const relative = path.relative(input.root, file).split(path.sep).join('/');
  nativeContentPath(input.root, provider, relative);
  const before = fs.lstatSync(file);
  if (before.size > 64 * 1024 * 1024) return [];
  const descriptor=fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW??0));
  let bytes:Buffer;
  try {
    const opened=fs.fstatSync(descriptor);
    if (opened.dev!==before.dev || opened.ino!==before.ino || opened.size!==before.size || opened.nlink!==1 || !opened.isFile()) return [];
    const buffer=Buffer.alloc(before.size+1); let length=0;
    while (length<buffer.length) {
      const read=fs.readSync(descriptor,buffer,length,buffer.length-length,length);
      if (!read) break;
      length+=read;
    }
    if (length!==before.size) return [];
    bytes=buffer.subarray(0,length);
  } finally { fs.closeSync(descriptor); }
  const result: NativeJsonRow[] = [];
  const lines = (buffer: Buffer, base: number, frame?: NativeContentSource) => {
    let start = 0, line = 0;
    while (start < buffer.length) {
      const end = buffer.indexOf(10, start); if (end < 0) throw new Error('native_content_partial_line');
      const raw = buffer.subarray(start, end);
      if (raw.length && raw.length <= maxNativeSourceBytes) {
        const source: NativeContentSource = frame ? { ...frame, line } : {
          path: relative, offset: base + start, length: raw.length, sha256: nativeContentHash(raw), codec: 'json',
        };
        result.push({ source, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) });
      }
      start = end + 1; line++;
      if (result.length > 100000) throw new Error('native_content_row_budget');
    }
  };
  if (file.endsWith('.zstd')) {
    let offset = 0, decoded = 0;
    while (offset < bytes.length) {
      const frame = zstdDecompressSync(bytes.subarray(offset), { info: true, maxOutputLength: 128 * 1024 * 1024 - decoded }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
      const length = frame.engine.bytesWritten;
      if (!length || length > maxNativeSourceBytes) return [];
      decoded += frame.buffer.length;
      lines(frame.buffer, 0, { path: relative, offset, length, codec: 'json-zstd', sha256: nativeContentHash(bytes.subarray(offset, offset + length)) });
      offset += length;
    }
  } else lines(bytes, 0);
  const after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return [];
  return result;
}

/** Image bytes are admitted only from explicit native image content, never prose or file paths. */
export function nativeContentImages(row: NativeJsonRow, pointer: Array<string | number>, content: unknown): NativeContentInventory['images'] {
  if (!Array.isArray(content)) return [];
  return content.flatMap<NativeContentInventory['images'][number]>((part: any, index) => {
    const base = [...pointer, index];
    if (part?.type === 'image' && part.source?.type === 'base64' && typeof part.source.data === 'string') {
      return [{ value: { source: row.source, pointer: [...base, 'source', 'data'], format: 'base64' as const }, mimeType: part.source.media_type }];
    }
    if (part?.type === 'input_image' && typeof part.image_url === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(part.image_url)) {
      const start = part.image_url.indexOf(',') + 1;
      return [{ value: { source: row.source, pointer: [...base, 'image_url'], start, format: 'base64' as const } }];
    }
    return [];
  });
}

type TextCandidate = { text: string; value: NativeContentValue };
const commandIndexes=new WeakMap<NativeContentInventory,Map<string,Map<string,string[]>>>();
/** A display id can change across Codex versions. Match complete command bytes,
 * not a fuzzy label, inside the already proven private configuration. */
export function nativeCommandIndex(inventory:NativeContentInventory,prefix:string,executionId?:string):Map<string,string[]> {
  let cached=commandIndexes.get(inventory);if(!cached){cached=new Map();commandIndexes.set(inventory,cached);}
  const hasTurn=executionId&&inventory.records.some(record=>record.executionId===executionId);
  const key=JSON.stringify([prefix,hasTurn?executionId:'']);const existing=cached.get(key);if(existing)return existing;
  const result=new Map<string,string[]>();
  for(const record of inventory.records) {
    if(!record.input||hasTurn&&record.executionId!==executionId)continue;
    const payload=(record.value as any).payload;let args:any;
    try{args=typeof payload?.arguments==='string'?JSON.parse(payload.arguments):payload?.arguments;}catch{continue;}
    if(!prefix&&args!==undefined)for(const value of [JSON.stringify(args),typeof payload.arguments==='string'?payload.arguments:undefined]) {
      if(typeof value!=='string')continue;
      for(const text of [value,nativePreview(value)]){const hash=nativeContentHash(text),ids=result.get(hash)??[];for(const id of record.toolIds)if(!ids.includes(id))ids.push(id);result.set(hash,ids);}
    }
    const commands=[args?.cmd,typeof args?.command==='string'?args.command:Array.isArray(args?.command)?args.command.at(-1):undefined].filter((value):value is string=>typeof value==='string');
    for(const command of commands)for(const format of [undefined,'quoted','shell-double','shell-single','shell-posix'] as const) {
      const hash=nativeContentHash(prefix+nativeValueText(command,format)),ids=result.get(hash)??[];
      for(const id of record.toolIds)if(!ids.includes(id))ids.push(id);result.set(hash,ids);
    }
  }
  cached.set(key,result);return result;
}

export const nativeCommandPrefix=(input:string)=>input.match(/^\S+ -l?c /)?.[0]??'';
function textCandidates(records: NativeContentRecord[]): TextCandidate[] {
  const result: TextCandidate[]=[];let visited=0;
  for(const record of records) {
    const walk=(value:any,pointer:Array<string|number>,jsonPointer:Array<string|number>|undefined,depth:number):void=>{
      if(++visited>100000||depth>32||result.length>=256)return;
      const address={source:record.source,pointer,...(jsonPointer?{jsonPointer}:{})};
      if(typeof value==='string') {
        result.push({text:value,value:address});
        if(!jsonPointer)try {
          const decoded=JSON.parse(value);
          if(decoded&&typeof decoded==='object')walk(decoded,pointer,[],depth+1);
        }catch{/* Ordinary strings have no inner JSON document. */}
      }else if(value&&typeof value==='object')result.push({text:JSON.stringify(value),value:{...address,format:'json'}});
      if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)) {
        const part=Array.isArray(value)?Number(key):key;
        walk(child,jsonPointer?pointer:[...pointer,part],jsonPointer?[...jsonPointer,part]:undefined,depth+1);
      }
    };
    walk(record.value,[],undefined,0);
  }
  return result;
}

function literals(text:string,residual=true):NativeTextPart[] {
  const result:NativeTextPart[]=[];let part='',bytes=0;
  for(const char of text){const size=Buffer.byteLength(char);if(bytes+size>512){result.push({literal:part,...(residual?{residual:true as const}:{})});part='';bytes=0;}part+=char;bytes+=size;}
  if(part)result.push({literal:part,...(residual?{residual:true as const}:{})});return result;
}

/** Native values and their deterministic display encodings are always revalidated by the reader. */
function matchingText(text:string,candidates:TextCandidate[],command=false):NativeTextPart[]|undefined {
  if(!text.length)return [];
  for(const candidate of candidates) {
    const start=candidate.text.indexOf(text);
    if(start>=0)return [{...candidate.value,start,length:text.length}];
    const marker=nativePreview('x'.repeat(16001)).slice(16000);
    if(text.endsWith(marker)) {
      const prefix=text.slice(0,-marker.length),offset=candidate.text.indexOf(prefix);
      if(prefix.length&&offset>=0)return [{...candidate.value,start:offset,length:prefix.length},{literal:marker}];
    }
    if(command&&candidate.value.format===undefined)for(const format of [undefined,'quoted','shell-double','shell-single','shell-posix'] as const) {
      const encoded=nativeValueText(candidate.text,format),at=text.indexOf(encoded);
      if(at>=0&&Buffer.byteLength(text.slice(0,at))+Buffer.byteLength(text.slice(at+encoded.length))<=512)
        return [...literals(text.slice(0,at),false),{...candidate.value,format},...literals(text.slice(at+encoded.length),false)];
    }
  }
  // Only retain gaps. Native model output can omit a middle segment which the
  // application had observed; deleting that unique segment would lose history.
  const intervals:Array<{from:number;to:number;offset:number;candidate:TextCandidate}>=[];
  for(let from=0;from+64<=text.length&&intervals.length<512&&from<32768;from+=64)for(const candidate of candidates.filter(value=>value.value.format===undefined)) {
    const found=candidate.text.indexOf(text.slice(from,from+64));if(found<0)continue;
    let left=from,right=from+64,offset=found;
    while(left>0&&offset>0&&text[left-1]===candidate.text[offset-1]){left--;offset--;}
    while(right<text.length&&offset+right-left<candidate.text.length&&text[right]===candidate.text[offset+right-left])right++;
    intervals.push({from:left,to:right,offset,candidate});if(intervals.length>=512)break;
  }
  intervals.sort((a,b)=>a.from-b.from||b.to-a.to);
  const parts:NativeTextPart[]=[];let position=0;
  for(const span of intervals) {
    if(span.to<=position)continue;
    if(span.from>position)parts.push(...literals(text.slice(position,span.from)));
    const from=Math.max(position,span.from);
    parts.push({...span.candidate.value,start:span.offset+from-span.from,length:span.to-from});position=span.to;
    if(parts.length>256)return;
  }
  if(position<text.length)parts.push(...literals(text.slice(position)));
  return parts.length<=256?parts:undefined;
}

/** Content equality is the final authority; format differences keep the existing local body. */
export function nativeToolReference(root: string, provider: string, contextId: string, nativeId: string, entry: ConversationEntry, inventory: NativeContentInventory, report?:(reason:string)=>void,executionId?:string): NativeToolContent | undefined {
  const records = inventory.records.filter(record => record.toolIds.includes(nativeId));
  if(!records.length&&provider==='codex'&&/^[^:#]+:\d+#[a-f0-9]+$/.test(nativeId)&&executionId!==undefined&&entry.input&&entry.input.length>=8) {
    const aliases=nativeCommandIndex(inventory,nativeCommandPrefix(entry.input),executionId).get(nativeContentHash(entry.input))??[];
    const matches:NativeToolContent[]=[];
    for(const alias of aliases) {
      const candidate=nativeToolReference(root,provider,contextId,alias,entry,inventory);
      const inputs=new Set(inventory.records.filter(record=>record.input&&record.toolIds.includes(alias)).map(record=>record.source.sha256));
      if(candidate?.input?.some(part=>'source'in part)&&candidate.input.every(part=>'source'in part?inputs.has(part.source.sha256):'literal'in part&&!part.residual))matches.push(candidate);
      if(matches.length>1)break;
    }
    if(matches.length===1)return matches[0];
    report?.(matches.length?'native_tool_alias_ambiguous':'native_tool_alias_unproven');return;
  }
  if (!records.length || entry.kind !== 'tool') {report?.('native_tool_not_found');return;}
  const candidates=textCandidates(records);
  const input=entry.input===undefined?undefined:matchingText(entry.input,candidates,true);
  if(entry.input!==undefined&&!input){report?.('native_input_budget');return;}
  const remainder=entry.input!==undefined&&entry.text.startsWith(entry.input+'\n')?matchingText(entry.text.slice(entry.input.length+1),candidates):undefined;
  const text=remainder?[{input:true as const},{literal:'\n'},...remainder]:matchingText(entry.text,candidates);
  if(!text){report?.('native_text_budget');return;}
  if(![...input??[],...text].some(part=>'source'in part)){report?.('native_text_unavailable');return;}
  const skeleton = { ...entry, text: '' }; if (input) skeleton.input = '';
  const reference: NativeToolContent = { version: 2, provider, contextId,nativeId, entry: skeleton, text, ...(input ? { input } : {}) };
  try { new NativeContentReader(root).tool(reference, nativeContentHash(JSON.stringify(entry))); return reference; } catch {report?.('native_reconstruction_mismatch');return;}
}
