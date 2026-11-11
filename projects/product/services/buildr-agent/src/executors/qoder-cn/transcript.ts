import fs from 'node:fs';
import { basename, join } from 'node:path';
import type { AgentExecutor, ExecutorItem } from '../../contracts.ts';
import { nativeContentFiles } from '../native-content.ts';
import { parseReference } from '../native-process.ts';

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
type ReceiptInput = Parameters<NonNullable<AgentExecutor['readSupplementReceipt']>>[0];
type PersistedInput = Parameters<NonNullable<AgentExecutor['readPersistedExecution']>>[0];

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textOf).join('');
  if (content && typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') return part.text;
    if (part.type === 'content') return textOf(part.content);
  }
  return '';
}

/** Buildr only prepends managed context or handoff text to the exact user input. */
function admittedTextMatches(nativeText: string, admittedText: string): boolean {
  if (nativeText === admittedText) return true;
  if (nativeText.endsWith('\n\n' + admittedText)) return true;
  const marker = '\n\n本次用户要求：\n';
  const at = nativeText.lastIndexOf(marker);
  if (at < 0) return false;
  const suffix = nativeText.slice(at + marker.length);
  return suffix === admittedText || suffix.startsWith(admittedText + '\n\n');
}

/** A native human prompt or the legacy bridge attachment can prove delivery. */
export function qoderCnPromptReceipt(row: any, contextId: string, cwd: string): {id:string;text:string;timestamp?:string;promptId?:string} | undefined {
  if (row?.sessionId !== contextId || row.isSidechain !== false || row.cwd !== cwd || typeof row.uuid !== 'string' || !row.uuid) return;
  const promptId = typeof row.promptId === 'string' && row.promptId ? row.promptId : undefined;
  if (row.type === 'attachment') {
    const attachment = row.attachment;
    if (attachment?.commandMode !== 'prompt' || attachment?.origin?.kind !== 'bridge') return;
    return { id: row.uuid, text: textOf(attachment.prompt), ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp } : {}), ...(promptId ? { promptId } : {}) };
  }
  if (row.type !== 'user') return;
  const content = row.message?.content;
  if (Array.isArray(content) && content.some((part: any) => part?.type === 'tool_result')) return;
  if (row.origin?.kind === 'task-notification') return;
  const human = row.origin?.kind === 'human' || row.humanInput === true || row.humanInput?.mode === 'prompt';
  if (!human) return;
  const text = typeof row.humanInput?.text === 'string' ? row.humanInput.text : textOf(content);
  return { id: row.uuid, text, ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp } : {}), ...(promptId ? { promptId } : {}) };
}

export interface QoderCnFinishedTurns {
  byPromptId: Map<string, {id:string;stopReason:string;text?:string;timestamp?:string;index:number}>;
  /** Exact native prompt row -> terminal assistant that descends from it. */
  byReceiptId: Map<string, {id:string;stopReason:string;text?:string;timestamp?:string;index:number}>;
}

export function qoderCnFinishedTurns(rows: any[], contextId: string, cwd: string): QoderCnFinishedTurns {
  const byUuid = new Map<string, any>();
  for (const row of rows) if (typeof row?.uuid === 'string' && row.uuid) byUuid.set(row.uuid, row);
  const receipts = new Map<string, {id:string;promptId?:string;human:boolean}>();
  for (const row of rows) {
    const receipt = qoderCnPromptReceipt(row, contextId, cwd);
    if (receipt) receipts.set(receipt.id, {id:receipt.id, ...(receipt.promptId ? {promptId:receipt.promptId} : {}), human:row.type === 'user'});
  }
  const byPromptId = new Map<string, {id:string;stopReason:string;text?:string;timestamp?:string;index:number}>();
  const byReceiptId = new Map<string, {id:string;stopReason:string;text?:string;timestamp?:string;index:number}>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row?.type !== 'assistant' || row.sessionId !== contextId || row.cwd !== cwd || row.isSidechain === true ||
      typeof row.message?.stop_reason !== 'string' || row.message.stop_reason === 'tool_use') continue;
    const text = (Array.isArray(row.message.content) ? row.message.content : []).filter((part: any) => part?.type === 'text').map((part: any) => String(part.text ?? '')).join('');
    const completion = {
      id: row.uuid,
      stopReason: row.message.stop_reason,
      ...(text ? { text } : {}),
      ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp } : {}),
      index,
    };
    let current = row;
    const seen = new Set<string>();
    let promptId: string | undefined;
    const receiptIds: string[] = [];
    while (current && typeof current.uuid === 'string' && !seen.has(current.uuid)) {
      seen.add(current.uuid);
      promptId ??= typeof current.promptId === 'string' && current.promptId ? current.promptId : undefined;
      const receipt = receipts.get(current.uuid);
      if (receipt) {
        receiptIds.push(receipt.id);
        promptId ??= receipt.promptId;
        // The first human prompt bounds this native turn; attachments above it
        // are queued inputs consumed by the same terminal assistant.
        if (receipt.human) break;
      }
      current = byUuid.get(current.parentUuid);
    }
    if (promptId && !byPromptId.has(promptId)) byPromptId.set(promptId, completion);
    for (const receiptId of receiptIds) if (!byReceiptId.has(receiptId)) byReceiptId.set(receiptId, completion);
  }
  return {byPromptId, byReceiptId};
}

/** Read one immutable native transcript snapshot; partial or changed writes prove nothing. */
export function readQoderCnTranscript(file: string): any[] | undefined {
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_TRANSCRIPT_BYTES) return;
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(descriptor);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) return;
      bytes = Buffer.alloc(before.size);
      let length = 0;
      while (length < bytes.length) {
        const read = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
        if (!read) break;
        length += read;
      }
      if (length !== before.size) return;
    } finally { fs.closeSync(descriptor); }
    const after = fs.lstatSync(file);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return;
    if (bytes.length && bytes.at(-1) !== 10) return;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch { return; }
}

function transcriptFile(input: ReceiptInput | PersistedInput): string | undefined {
  const account = input.nativeAccountConfigRoot ?? input.configRoot;
  const config = join(account, 'qoder-cn-config');
  const files = nativeContentFiles(
    { root: account, configRoot: account, contextId: input.contextRef.id, cwd: input.cwd },
    join(config, 'projects'),
    file => basename(file) === `${input.contextRef.id}.jsonl`,
    3,
  );
  return files.length === 1 ? files[0] : undefined;
}

/** Read only complete append-only rows after a previously observed byte offset. */
export function readQoderCnTranscriptAppend(file: string, offset: number): {rows:any[];offset:number} | undefined {
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_TRANSCRIPT_BYTES || offset < 0 || offset > before.size) return;
    if (before.size === offset) return {rows: [], offset};
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(descriptor);
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) return;
      bytes = Buffer.alloc(before.size - offset);
      let length = 0;
      while (length < bytes.length) {
        const read = fs.readSync(descriptor, bytes, length, bytes.length - length, offset + length);
        if (!read) break;
        length += read;
      }
      if (length !== bytes.length) return;
    } finally { fs.closeSync(descriptor); }
    const end = bytes.lastIndexOf(10);
    if (end < 0) return;
    const rows = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end)).split('\n').filter(Boolean).map(line => JSON.parse(line));
    return {rows, offset: offset + end + 1};
  } catch { return; }
}

/** Historical repair uses exact text plus a strict post-admission timestamp; ambiguity proves nothing. */
export async function readQoderCnSupplementReceipt(input: ReceiptInput): Promise<{inputItemId:string} | undefined> {
  if (!input.text.trim()) return;
  const native = parseReference(String(input.contextRef.data?.native ?? ''), 'qoder-cn', input.cwd, input.bindingIdentity);
  if (native.nativeSessionId !== input.contextRef.id ||
    input.executionRef.data?.resourceContext !== input.contextRef.id ||
    input.executionRef.data?.resourceBinding !== input.bindingIdentity) return;
  const admittedAt = Date.parse(input.createdAt);
  if (!Number.isFinite(admittedAt)) return;
  const file = transcriptFile(input);
  if (!file) return;
  const rows = readQoderCnTranscript(file);
  if (!rows) return;
  const matches: Array<{id:string;text:string;timestamp:string}> = [];
  for (const row of rows) {
    const receipt = qoderCnPromptReceipt(row, input.contextRef.id, input.cwd);
    if (!receipt?.timestamp || receipt.text !== input.text) continue;
    const at = Date.parse(receipt.timestamp);
    if (!Number.isFinite(at) || at < admittedAt) continue;
    matches.push({ ...receipt, timestamp: receipt.timestamp });
  }
  return matches.length === 1 ? { inputItemId: matches[0]!.id } : undefined;
}

/** Durable completion evidence for a lost ACP terminal frame. The native
 * transcript is append-only and proves both the exact admitted inputs and the
 * final assistant stop reason without opening a process or replaying input. */
export async function readQoderCnPersistedExecution(input: PersistedInput): Promise<{items:ExecutorItem[];observation:{status:'idle';executionRef:NonNullable<PersistedInput['executionRef']>;tools:Array<{id:string;label:string;status:'completed'}>};endedAt?:string} | undefined> {
  const nativeInputs=typeof input.nativeInputs==='object'&&input.nativeInputs?input.nativeInputs:[];
  if(!nativeInputs.length)return;
  const native = parseReference(String(input.contextRef.data?.native ?? ''), 'qoder-cn', input.cwd, input.bindingIdentity);
  if (native.nativeSessionId !== input.contextRef.id ||
    input.executionRef.data?.resourceContext !== input.contextRef.id ||
    input.executionRef.data?.resourceBinding !== input.bindingIdentity) return;
  const file=transcriptFile(input);
  if(!file)return;
  const rows=readQoderCnTranscript(file);
  if(!rows)return;
  const prompts:Array<{id:string;text:string;timestamp:string;promptId?:string;index:number}>=[];
  for(let index=0;index<rows.length;index++){
    const row=rows[index];
    const receipt=qoderCnPromptReceipt(row,input.contextRef.id,input.cwd);
    if(!receipt?.timestamp)continue;
    if(!Number.isFinite(Date.parse(receipt.timestamp)))continue;
    prompts.push({id:receipt.id,text:receipt.text,timestamp:receipt.timestamp,...(receipt.promptId?{promptId:receipt.promptId}:{}),index});
  }
  const matched:Array<{input:NonNullable<PersistedInput['nativeInputs']>[number];prompt:typeof prompts[number]}>=[];
  const used=new Set<string>();
  for(const admission of nativeInputs){
    const admittedAt=Date.parse(admission.createdAt);
    if(!Number.isFinite(admittedAt)||!admission.text.trim())return;
    const candidates=prompts.filter(prompt=>!used.has(prompt.id)&&admittedTextMatches(prompt.text,admission.text)&&
      Date.parse(prompt.timestamp)+1000>=admittedAt);
    if(candidates.length!==1)return;
    used.add(candidates[0]!.id);matched.push({input:admission,prompt:candidates[0]!});
  }
  if(!matched.length)return;
  const ordered=[...matched].sort((left,right)=>Date.parse(left.prompt.timestamp)-Date.parse(right.prompt.timestamp));
  if(ordered.some((value,index)=>index>0&&value.prompt.index<=ordered[index-1]!.prompt.index))return;
  // Every native input between the first and last admission belongs to this run.
  // A later or interleaved human/queued prompt means the completion cannot be
  // attributed without borrowing another turn's terminal fact.
  if(prompts.some(prompt=>prompt.index>=ordered[0]!.prompt.index&&!used.has(prompt.id))){
    return;
  }
  const finished=qoderCnFinishedTurns(rows,input.contextRef.id,input.cwd);
  const completions=ordered.map(value=>finished.byReceiptId.get(value.prompt.id));
  if(completions.some(value=>!value||value.stopReason!=='end_turn'))return;
  const final=[...completions].filter((value):value is NonNullable<typeof value>=>Boolean(value))
    .sort((left,right)=>left.index-right.index).at(-1);
  if(!final)return;
  const firstIndex=ordered[0]!.prompt.index;
  if(final.index<firstIndex)return;
  const scoped=rows.slice(firstIndex,final.index+1).filter(row=>row?.sessionId===input.contextRef.id&&row.isSidechain===false&&row.cwd===input.cwd);
  const calls=new Map<string,{id:string;label:string}>(),results=new Set<string>();
  for(const row of scoped){
    const parts=Array.isArray(row.message?.content)?row.message.content:[];
    if(row.type==='assistant')for(const part of parts){
      if(part?.type==='tool_use'&&typeof part.id==='string'){
        calls.set(part.id,{id:part.id,label:typeof part.name==='string'&&part.name?part.name:'工具'});
      }
    }
    if(row.type==='user')for(const part of parts){
      if(part?.type==='tool_result'&&typeof part.tool_use_id==='string')results.add(part.tool_use_id);
    }
  }
  if([...calls.keys()].some(id=>!results.has(id)))return;
  const items:ExecutorItem[]=ordered.map(value=>({
    id:value.prompt.id,clientRequestId:value.input.clientRequestId,kind:'message',role:'user',
    text:value.input.text,executionId:input.executionRef.id,status:'completed',
  }));
  return {
    items,
    observation:{
      status:'idle',executionRef:input.executionRef,
      tools:[...calls.values()].map(value=>({...value,status:'completed' as const})),
    },
    ...(final.timestamp&&Number.isFinite(Date.parse(final.timestamp))?{endedAt:final.timestamp}:{}),
  };
}
