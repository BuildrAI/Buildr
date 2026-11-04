import fs from 'node:fs';
import { nativeContentPath, maxNativeSourceBytes, nativeValueText } from '../../storage/native-content.ts';
import { codexItem } from './items.ts';
import type { NativeToolContent } from '../../native-content-contracts.ts';
import path from 'node:path';
import type { NativeContentContext, NativeContentInventory } from '../../native-content-contracts.ts';
import { nativeContentFiles, nativeContentImages, nativeContentRows } from '../native-content.ts';

export function codexContent(input: NativeContentContext): NativeContentInventory | undefined {
  if (!/^[a-f0-9-]{36}$/.test(input.contextId)) return;
  const files = nativeContentFiles(input, path.join(input.configRoot, 'codex-home/sessions'), file => path.basename(file).endsWith(input.contextId + '.jsonl'));
  if (files.length !== 1) return;
  const rows = nativeContentRows(input, 'codex', files[0]!);
  const meta = rows[0]?.value;
  if (meta?.type !== 'session_meta' || meta.payload?.id !== input.contextId || meta.payload.cwd !== input.cwd) return;
  let executionId:string|undefined;
  return { sourcePaths: files, records: rows.flatMap(row => {
    const value = row.value.payload;
    if(row.value.type==='turn_context'||row.value.type==='event_msg'&&value?.type==='task_started')executionId=value?.turn_id;
    if(row.value.type === 'event_msg' && value?.type === 'item_completed' && typeof value.item?.id === 'string')
      return [{...row, toolIds: [value.item.id], executionId: value.turn_id}];
    if (!['response_item', 'event_msg'].includes(row.value.type) || typeof value?.call_id !== 'string') return [];
    return [{ ...row, toolIds: [value.call_id],executionId,input:['function_call','custom_tool_call','exec_command_begin'].includes(value.type) }];
  }), images: rows.filter(row => row.value.type === 'response_item' && row.value.payload?.type === 'message')
    .flatMap(row => nativeContentImages(row, ['payload', 'content'], row.value.payload.content)) };
}

export function readCodexTool(root: string, reference: NativeToolContent) {
  const session = reference.session;
  if(reference.version !== 3 || reference.provider !== 'codex' || !session || !reference.nativeId ||
    !/^connections\/codex(?:\/model-bindings\/[a-f0-9]{64})?$/.test(session.config) || !/^[a-f0-9-]{36}$/.test(reference.contextId)) return;
  const input = {root, configRoot: path.join(root, session.config), contextId: reference.contextId, cwd: session.cwd};
  let original: Record<string, any> | undefined;
  try { original = completedTool(input,reference.nativeId,session.turnId); }
  catch { return; }
  if(!original) return;
  const item = Object.fromEntries(Object.entries(original).map(([key,value]) => [key.replace(/_([a-z])/g, (_,letter:string) => letter.toUpperCase()),value]));
  if(Array.isArray(item.command)) item.command = item.command.map(value=>nativeValueText(value,'shell-single')).join(' ');
  item.type = String(original.type).replace(/^[A-Z]/, letter => letter.toLowerCase());
  if(typeof item.status === 'string') item.status = item.status.replace(/^[A-Z]/,letter=>letter.toLowerCase());
  if(item.type === 'fileChange' && item.changes && !Array.isArray(item.changes))
    item.changes = Object.entries(item.changes as Record<string,unknown>).map(([path,change]) => ({...(change as object),path}));
  const detail = codexItem(item, session.turnId ?? '', 'completed', true).find(value => value.kind === 'tool');
  if(!detail) return;
  return {...reference.entry, text: detail.text, input: detail.input, presentedFiles: detail.presentedFiles ?? reference.entry.presentedFiles};
}

/** Scan a bounded line at a time, so a long session does not require a second body cache. */
function completedTool(input: NativeContentContext, id: string, turnId?: string): Record<string, any> | undefined {
  const files = nativeContentFiles(input,path.join(input.configRoot,'codex-home/sessions'),file=>path.basename(file).endsWith(input.contextId+'.jsonl'));
  if(files.length !== 1) return;
  const relative = path.relative(input.root,files[0]!).split(path.sep).join('/');
  const file = nativeContentPath(input.root,'codex',relative);
  const before = fs.lstatSync(file);
  const descriptor = fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let completed: Record<string, any> | undefined, completedTurn: string | undefined;
  let header = false, ambiguous = false;
  let segments: Buffer[] = [], lineBytes = 0;
  const consume = () => {
    const row = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(segments,lineBytes)));
    segments = [];lineBytes = 0;
    if(!header) {
      if(row.type !== 'session_meta' || row.payload?.id !== input.contextId || row.payload.cwd !== input.cwd) throw new Error('codex_native_session_mismatch');
      header = true;
    }
    const value = row.payload;
    if(row.type !== 'event_msg' || value?.type !== 'item_completed' || value.item?.id !== id || turnId && value.turn_id !== turnId) return;
    if(completed && completedTurn !== value.turn_id) ambiguous = true;
    completed = value.item;completedTurn = value.turn_id;
  };
  try {
    const opened = fs.fstatSync(descriptor);
    if(opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size || opened.nlink !== 1 || !opened.isFile()) return;
    const buffer = Buffer.alloc(64*1024);
    let position = 0;
    while(position < before.size) {
      const length = fs.readSync(descriptor,buffer,0,Math.min(buffer.length,before.size-position),position);
      if(!length) return;
      position += length;
      let start = 0;
      while(start < length) {
        const newline = buffer.indexOf(10,start);
        const end = newline >= 0 && newline < length ? newline : length;
        const segment = buffer.subarray(start,end);
        lineBytes += segment.length;
        if(lineBytes > maxNativeSourceBytes) throw new Error('codex_native_line_budget');
        segments.push(Buffer.from(segment));
        if(end < length) {if(lineBytes) consume();else segments = [];start = end+1;}
        else break;
      }
    }
  } finally {fs.closeSync(descriptor);}
  const after = fs.lstatSync(file);
  if(after.ino !== before.ino || after.dev !== before.dev || after.size < before.size ||
    after.size === before.size && (after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)) return;
  return header && !ambiguous ? completed : undefined;
}
