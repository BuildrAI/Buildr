/** Public observations independent of session logs and telemetry. */
export const SOURCE_OBSERVATIONS_SCHEMA = 'buildr.agent-asset-source-observations/v1';
export const SOURCE_RESULT_SCHEMA = 'buildr.agent-asset-source-result/v1';
export const SOURCE_LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, items: 32, outputBytes: 2 * 1024 * 1024, textBytes: 512 * 1024, timeoutMs: 5000 });
export type SourceParty = 'buildr' | 'workspace' | 'openspec' | 'external' | 'unknown';
export interface SourceObservation {
  id: string;
  type: 'file' | 'skill' | 'task-brief' | 'task-material' | 'capability';
  locator?: { path?: string; resourceBase?: string; provider?: string; adapterId?: string };
  observedContent?: string;
  observedDigest?: string;
  taskId?: string;
  materialId?: string;
  capabilityId?: string;
  version?: number;
}
export interface SourceObject {
  identity: string; kind: 'rule' | 'skill' | 'task-brief' | 'task-material' | 'capability';
  workspaceId: string; scope: string; providedBy: SourceParty; managedBy: 'buildr' | null;
  selector: Record<string, string | number>;
  current: { content: string; digest: string } | null;
  observed: { content?: string; digest?: string };
  historical: 'matched-current' | 'different' | 'unknown';
  evidence: Array<{ authority: string; locator: string; digest?: string }>;
  selection?: { startOffset: number; endOffset: number; unit: 'utf16' };
}
export interface SourceItem {
  id: string; status: 'detected' | 'unknown' | 'conflict' | 'error'; objects: SourceObject[];
  diagnostic: { code: string; message: string } | null; mixed?: boolean;
}
export interface SourceResult {
  schemaVersion: typeof SOURCE_RESULT_SCHEMA; workspace: { id: string; scope: string };
  items: SourceItem[]; effects: [];
}
export function sourceError(code: string, message: string) { return Object.assign(new Error(message), { code }); }
export function parseSourceInput(value: unknown) {
  const input = record(value);
  fields(input, ['schemaVersion', 'scope', 'observations', 'mode']);
  if (input.schemaVersion !== SOURCE_OBSERVATIONS_SCHEMA) throw sourceError('source_schema_unsupported', '不支持此来源观察版本。');
  if (!Array.isArray(input.observations) || input.observations.length > SOURCE_LIMITS.items) throw sourceError('source_input_limit', '一次最多读取 32 个来源观察。');
  if (Buffer.byteLength(JSON.stringify(value)) > SOURCE_LIMITS.inputBytes) throw sourceError('source_input_limit', '来源观察超过 2 MiB。');
  if (input.mode !== undefined && input.mode !== 'metadata' && input.mode !== 'content') throw sourceError('source_input_invalid', 'mode 必须为 metadata 或 content。');
  return { scope: input.scope === undefined ? '.' : text(input.scope), observations: input.observations,
    mode: input.mode === 'metadata' ? 'metadata' as const : 'content' as const };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw sourceError('source_input_invalid', '观察必须是对象。');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw sourceError('source_input_invalid', '观察包含未支持字段。');
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value || value.includes('\0') || Buffer.byteLength(value) > 4096) throw sourceError('source_input_invalid', '定位器必须是有界文本。');
  return value;
}
export function parseObservation(value: unknown): SourceObservation {
  const item = record(value);
  fields(item, ['id', 'type', 'locator', 'observedContent', 'observedDigest', 'taskId', 'materialId', 'capabilityId', 'version']);
  if (!['file', 'skill', 'task-brief', 'task-material', 'capability'].includes(String(item.type))) throw sourceError('source_input_invalid', '不支持此观察类型。');
  const output: SourceObservation = { id: text(item.id), type: item.type as SourceObservation['type'] };
  if (item.locator !== undefined) {
    const locator = record(item.locator); fields(locator, ['path', 'resourceBase', 'provider', 'adapterId']); output.locator = {};
    for (const key of ['path', 'resourceBase', 'provider', 'adapterId'] as const) if (locator[key] !== undefined) output.locator[key] = text(locator[key]);
  }
  if (item.observedContent !== undefined) {
    if (typeof item.observedContent !== 'string' || item.observedContent.includes('\0') || Buffer.byteLength(item.observedContent) > SOURCE_LIMITS.textBytes) throw sourceError('source_input_limit', '观察正文超过读取限制或不是文本。');
    output.observedContent = item.observedContent;
  }
  if (item.observedDigest !== undefined) {
    if (typeof item.observedDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(item.observedDigest)) throw sourceError('source_input_invalid', '观察摘要必须为完整 sha256- 值。');
    output.observedDigest = item.observedDigest;
  }
  for (const key of ['taskId', 'materialId', 'capabilityId'] as const) if (item[key] !== undefined) output[key] = text(item[key]);
  if (item.version !== undefined) {
    if (!Number.isSafeInteger(item.version) || Number(item.version) < 1) throw sourceError('source_input_invalid', '能力版本必须为正整数。');
    output.version = Number(item.version);
  }
  return output;
}

/** Bound the complete serialized result, including wrappers and UTF-8 bytes. */
export function boundSourceResult(result: SourceResult, maxBytes = SOURCE_LIMITS.outputBytes): SourceResult {
  const bounded = { ...result, items: result.items.map(item => ({ ...item })) };
  for (let index = bounded.items.length - 1; Buffer.byteLength(JSON.stringify(bounded)) + 1 > maxBytes && index >= 0; index--) {
    const item = bounded.items[index];
    if (!item.objects.length) continue;
    bounded.items[index] = { id: item.id, status: 'error', objects: [], diagnostic: { code: 'source_output_limit', message: '完整来源结果超过返回上限；请按对象分批读取。' } };
  }
  if (Buffer.byteLength(JSON.stringify(bounded)) + 1 > maxBytes) throw sourceError('source_output_limit', '来源结果包装超过返回上限。');
  return bounded;
}

export function sourceMemberIdentity(assetIdentity: string, member: string): string {
  return member === 'SKILL.md' ? assetIdentity : `${assetIdentity}:member:${member}`;
}
