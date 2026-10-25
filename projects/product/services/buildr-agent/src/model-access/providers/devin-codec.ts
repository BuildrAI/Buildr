/**
 * Devin protobuf field mappings adapted from dsh-plugin-oauth-subs, MIT.
 * Copyright (c) 2026 dsh-plugin-oauth-subs contributors.
 * Source: 7c6d13b4f1b7801c36e6ce8d154ce7b90ae923b4/lib/oauth/devin/proto.js.
 * See THIRD_PARTY_NOTICES.md. Bounds and strict decoding are maintained here.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

const MAX_FRAME = 16 * 1024 * 1024;
export interface ProtoField { field: number; wire: number; integer?: bigint; bytes?: Buffer; }
export interface ConnectFrame { end: boolean; payload: Buffer; }
export function uint(value: number | bigint): Buffer {
  let rest = BigInt(value); if (rest < 0) rest = BigInt.asUintN(64, rest);
  const bytes: number[] = [];
  do { const byte = Number(rest & 127n); rest >>= 7n; bytes.push(byte | (rest ? 128 : 0)); } while (rest);
  return Buffer.from(bytes);
}
export function bytesField(field: number, bytes: Uint8Array): Buffer { return Buffer.concat([uint(field * 8 + 2), uint(bytes.length), bytes]); }
export function stringField(field: number, value: string): Buffer { return bytesField(field, Buffer.from(value)); }
export function intField(field: number, value: number | bigint): Buffer { return Buffer.concat([uint(field * 8), uint(value)]); }
function doubleField(field: number, value: number): Buffer { const bytes = Buffer.alloc(8); bytes.writeDoubleLE(value); return Buffer.concat([uint(field * 8 + 1), bytes]); }
function readUint(bytes: Buffer, start: number): { value: bigint; next: number } {
  let value = 0n;
  for (let i = 0; i < 10; i++) {
    const byte = bytes[start + i];
    if (byte === undefined || (i === 9 && byte > 1)) throw new Error('model_devin_proto_invalid');
    value |= BigInt(byte & 127) << BigInt(i * 7);
    if (!(byte & 128)) return { value, next: start + i + 1 };
  }
  throw new Error('model_devin_proto_invalid');
}
export function fields(input: Uint8Array): ProtoField[] {
  const bytes = Buffer.from(input); const result: ProtoField[] = []; let offset = 0;
  while (offset < bytes.length) {
    const tag = readUint(bytes, offset); offset = tag.next;
    const field = Number(tag.value >> 3n), wire = Number(tag.value & 7n);
    if (!field || field > 536870911) throw new Error('model_devin_proto_invalid');
    if (wire === 0) { const n = readUint(bytes, offset); result.push({ field, wire, integer: n.value }); offset = n.next; }
    else if (wire === 2 || wire === 1 || wire === 5) {
      let length: number;
      if (wire === 2) { const n = readUint(bytes, offset); offset = n.next; if (n.value > BigInt(MAX_FRAME)) throw new Error('model_devin_proto_too_large'); length = Number(n.value); }
      else length = wire === 1 ? 8 : 4;
      if (length > bytes.length - offset) throw new Error('model_devin_proto_truncated');
      result.push({ field, wire, bytes: bytes.subarray(offset, offset + length) }); offset += length;
    } else throw new Error('model_devin_proto_invalid');
  }
  return result;
}
export function allBytes(rows: ProtoField[], field: number): Buffer[] { return rows.flatMap(row => row.field === field && row.bytes ? [row.bytes] : []); }
export function text(rows: ProtoField[], field: number): string | undefined { return allBytes(rows, field)[0]?.toString('utf8'); }
export function integer(rows: ProtoField[], field: number, signed = false): number | undefined {
  const value = rows.find(row => row.field === field && row.wire === 0)?.integer;
  if (value === undefined) return undefined;
  const number = Number(signed ? BigInt.asIntN(64, value) : value);
  return Number.isSafeInteger(number) ? number : undefined;
}
export function metadata(token: string): Buffer {
  return Buffer.concat([stringField(1, 'chisel'), stringField(2, '3000.10.31'), stringField(3, token), stringField(4, 'en'), stringField(5, process.platform), stringField(7, '3000.10.31'), stringField(12, 'chisel'), bytesField(30, Buffer.from([3, 4, 6, 7, 8]))]);
}
export interface DevinImage { base64: string; mime: string; }
export interface DevinToolCall { id: string; name: string; arguments: string; }
export interface DevinPrompt { id: string; role: 1 | 2 | 4; text: string; calls?: DevinToolCall[]; callId?: string; images?: DevinImage[]; thinking?: string; signature?: Buffer; }
export interface DevinTool { name: string; description: string; parameters: string; strict?: boolean; }
export interface DevinRequest { token: string; system: string; prompts: DevinPrompt[]; tools: DevinTool[]; model: string; cascade: string; execution: string; maxTokens: number; temperature?: number; topP?: number; toolChoice?: string; parallelTools?: boolean; }
function encodePrompt(prompt: DevinPrompt): Buffer {
  const out = [stringField(1, prompt.id), intField(2, prompt.role), stringField(3, prompt.text)];
  for (const call of prompt.calls ?? []) out.push(bytesField(6, Buffer.concat([stringField(1, call.id), stringField(2, call.name), stringField(3, call.arguments)])));
  if (prompt.callId) out.push(stringField(7, prompt.callId));
  for (const image of prompt.images ?? []) out.push(bytesField(10, Buffer.concat([stringField(1, image.base64), stringField(2, image.mime)])));
  if (prompt.thinking) out.push(stringField(11, prompt.thinking));
  if (prompt.signature) out.push(bytesField(12, prompt.signature));
  return Buffer.concat(out);
}
export function encodeRequest(request: DevinRequest): Buffer {
  const temp = request.temperature ?? 0.4;
  const configuration = [intField(1, 1), intField(2, request.maxTokens), intField(3, 200), doubleField(5, temp), doubleField(6, temp), intField(7, 50), doubleField(8, request.topP ?? 1), doubleField(11, 1)];
  for (const pattern of ['<|user|>', '<|bot|>', '<|context_request|>', '<|endoftext|>', '<|end_of_turn|>']) configuration.push(stringField(9, pattern));
  const out = [bytesField(1, metadata(request.token)), stringField(2, request.system)];
  for (const prompt of request.prompts) out.push(bytesField(3, encodePrompt(prompt)));
  out.push(intField(7, 5), bytesField(8, Buffer.concat(configuration)));
  for (const tool of request.tools) out.push(bytesField(10, Buffer.concat([stringField(1, tool.name), stringField(2, tool.description), stringField(3, tool.parameters), ...(tool.strict ? [intField(12, 1)] : [])])));
  out.push(intField(11, request.parallelTools ? 0 : 1), bytesField(12, ['auto', 'none', 'required'].includes(request.toolChoice ?? 'auto') ? stringField(1, request.toolChoice ?? 'auto') : stringField(2, request.toolChoice!)), bytesField(13, intField(1, 1)), stringField(16, request.cascade), intField(20, 1), stringField(21, request.model), stringField(22, request.execution));
  return Buffer.concat(out);
}
export interface DevinDelta { text?: string; thinking?: string; signature?: Buffer; model?: string; stop?: number; calls: Array<Partial<DevinToolCall>>; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }; }
export function decodeDelta(bytes: Uint8Array): DevinDelta {
  const rows = fields(bytes), usageBytes = allBytes(rows, 7)[0]; const usage = usageBytes ? fields(usageBytes) : undefined;
  return { text: text(rows, 3), thinking: text(rows, 9), signature: allBytes(rows, 10)[0], model: text(rows, 23), stop: integer(rows, 5), calls: allBytes(rows, 6).map(call => { const r = fields(call); return { id: text(r, 1), name: text(r, 2), arguments: text(r, 3) }; }), ...(usage ? { usage: { input: integer(usage, 2) ?? 0, output: integer(usage, 3) ?? 0, cacheWrite: integer(usage, 4) ?? 0, cacheRead: integer(usage, 5) ?? 0 } } : {}) };
}
export interface DevinModelRow { id: string; label: string; family?: string; images: boolean; disabled: boolean; contextWindow?: number; maxOutput?: number; isDefault: boolean; }
export function decodeModels(bytes: Uint8Array): DevinModelRow[] {
  return allBytes(fields(bytes), 1).map(entry => {
    const rows = fields(entry), infoBytes = allBytes(rows, 23)[0], familyBytes = allBytes(rows, 30)[0];
    const info = infoBytes ? fields(infoBytes) : [], family = familyBytes ? fields(familyBytes) : [];
    return { id: text(rows, 22) ?? text(info, 17) ?? '', label: text(rows, 1) ?? '', family: text(info, 23) ?? text(family, 1), images: integer(rows, 5) === 1, disabled: integer(rows, 4) === 1, contextWindow: integer(info, 4) ?? integer(rows, 18), maxOutput: integer(info, 13), isDefault: integer(rows, 31) === 1 };
  }).filter(row => row.id && !row.disabled);
}
export interface DevinStatus { label?: string; plan?: string; canUseCli?: boolean; daily?: number; weekly?: number; dailyReset?: number; weeklyReset?: number; }
export function decodeStatus(bytes: Uint8Array): DevinStatus {
  const rows = fields(bytes), userBytes = allBytes(rows, 1)[0], user = userBytes ? fields(userBytes) : [];
  const statusBytes = allBytes(user, 13)[0], status = statusBytes ? fields(statusBytes) : [];
  const planBytes = allBytes(rows, 2)[0] ?? allBytes(status, 1)[0], plan = planBytes ? fields(planBytes) : [];
  const devinBytes = allBytes(plan, 33)[0], devin = devinBytes ? fields(devinBytes) : [];
  return { label: text(user, 7) ?? text(user, 3) ?? text(devin, 8), plan: text(plan, 2), ...(integer(devin, 2) === undefined ? {} : { canUseCli: integer(devin, 2) === 1 }), ...(integer(plan, 36) === 1 ? {} : { daily: integer(status, 14), dailyReset: integer(status, 17) }), ...(integer(plan, 37) === 1 ? {} : { weekly: integer(status, 15), weeklyReset: integer(status, 18) }) };
}
export function connectFrame(payload: Uint8Array, end = false, compress = true): Buffer {
  const bytes = compress ? gzipSync(payload) : Buffer.from(payload); if (bytes.length > MAX_FRAME) throw new Error('model_devin_frame_too_large');
  const header = Buffer.alloc(5); header[0] = (compress ? 1 : 0) | (end ? 2 : 0); header.writeUInt32BE(bytes.length, 1); return Buffer.concat([header, bytes]);
}
export function splitFrames(input: Uint8Array): { frames: ConnectFrame[]; rest: Buffer } {
  const bytes = Buffer.from(input), result: ConnectFrame[] = []; let offset = 0;
  while (bytes.length - offset >= 5) {
    const flags = bytes[offset]!, length = bytes.readUInt32BE(offset + 1);
    if (flags & ~3 || length > MAX_FRAME) throw new Error('model_devin_frame_invalid');
    if (bytes.length - offset < length + 5) break;
    const payload = bytes.subarray(offset + 5, offset + 5 + length);
    result.push({ end: Boolean(flags & 2), payload: flags & 1 ? gunzipSync(payload, { maxOutputLength: MAX_FRAME }) : payload }); offset += length + 5;
  }
  return { frames: result, rest: bytes.subarray(offset) };
}
export function unaryBody(input: Uint8Array): Buffer {
  const bytes = Buffer.from(input);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes, { maxOutputLength: MAX_FRAME });
  if (bytes.length >= 5 && bytes[0]! <= 3 && bytes.readUInt32BE(1) === bytes.length - 5) {
    const { frames } = splitFrames(bytes); const frame = frames[0]; if (!frame || frame.end) throw new Error('model_devin_unary_invalid'); return frame.payload;
  }
  return bytes;
}
