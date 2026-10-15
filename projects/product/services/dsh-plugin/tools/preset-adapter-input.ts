/** Closed metadata accepted by a task-owned preset adapter builder. No runtime or profile operations. */
import { Buffer } from 'node:buffer';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESET_PRODUCERS } from './capture-preset-adapter.ts';
import type { PresetChangePlan, PresetChangeReceipt, PresetNameChange } from './capture-preset-adapter.ts';

const MAX_METADATA_BYTES = 64 * 1024;
const digestPattern = /^[a-f0-9]{64}$/;
type MetadataKind = 'plan' | 'receipt';
type RecordValue = Record<string, unknown>;

/** A fixed diagnostic never repeats input values, bodies, paths, or keys. */
export class PresetAdapterInputError extends Error {
  readonly code: 'invalid-plan-metadata' | 'invalid-receipt-metadata' | 'metadata-limit';
  constructor(kind: MetadataKind, limit = false) {
    const code = limit ? 'metadata-limit' : kind === 'plan' ? 'invalid-plan-metadata' : 'invalid-receipt-metadata';
    super(`Preset adapter input: ${code}`);
    this.name = 'PresetAdapterInputError'; this.code = code;
  }
}

function reject(kind: MetadataKind): never { throw new PresetAdapterInputError(kind); }
function object(value: unknown, required: readonly string[], optional: readonly string[], kind: MetadataKind): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return reject(kind);
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !allowed.has(key) || !Object.hasOwn(descriptor, 'value')) return reject(kind);
  }
  if (required.some(key => !Object.hasOwn(value, key))) return reject(kind);
  return value as RecordValue;
}
function text(value: unknown, maxBytes: number, kind: MetadataKind): string {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)
    || Buffer.byteLength(value, 'utf8') > maxBytes) return reject(kind);
  return value;
}
function digest(value: unknown, kind: MetadataKind): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) return reject(kind);
  return value;
}
function array(value: unknown, kind: MetadataKind): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return reject(kind);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key)
      || Number(key) >= value.length || !Object.hasOwn(descriptor, 'value')) return reject(kind);
  }
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return reject(kind);
  return value;
}
function fileURL(value: unknown, kind: MetadataKind): string {
  const url = text(value, 4096, kind);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash || parsed.href !== url
      || fileURLToPath(parsed).includes('\0')) return reject(kind);
  } catch { return reject(kind); }
  return url;
}
function identity(value: RecordValue, kind: MetadataKind) {
  const module = text(value.module, 256, kind);
  if (module !== '@deepseek-ai/dsh-agent-preset') return reject(kind);
  return { presetId: text(value.presetId, 512, kind), ownerEntryId: text(value.ownerEntryId, 1024, kind),
    optionsId: text(value.optionsId, 512, kind), module, baseURL: fileURL(value.baseURL, kind) };
}
function changes(value: unknown, kind: MetadataKind): PresetNameChange[] {
  const input = array(value, kind);
  if (input.length !== PRESET_PRODUCERS.length) return reject(kind);
  const names = new Set<string>(), paths = new Set<string>(), urls = new Set<string>();
  return input.map(item => {
    const row = object(item, ['path', 'beforeName', 'beforeRowDigest', 'afterURL', 'afterFileSha256'], [], kind);
    const beforeName = text(row.beforeName, 256, kind);
    if (!(PRESET_PRODUCERS as readonly string[]).includes(beforeName) || names.has(beforeName)) return reject(kind);
    names.add(beforeName);
    const path = array(row.path, kind).map(index => {
      if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) return reject(kind);
      return index;
    });
    const key = JSON.stringify(path);
    if (path.length === 0 || paths.has(key)) return reject(kind);
    paths.add(key);
    const afterURL = fileURL(row.afterURL, kind);
    if (urls.has(afterURL)) return reject(kind);
    urls.add(afterURL);
    return { path, beforeName, beforeRowDigest: digest(row.beforeRowDigest, kind), afterURL,
      afterFileSha256: digest(row.afterFileSha256, kind) };
  });
}
function bounded<T>(value: T, kind: MetadataKind): T {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_METADATA_BYTES) throw new PresetAdapterInputError(kind, true);
  return value;
}

/** Accept only a detached five-name plan, with no raw preset configuration or additional fields. */
export function canonicalizePresetChangePlan(value: unknown): PresetChangePlan {
  try { return planMetadata(value); }
  catch (error) { if (error instanceof PresetAdapterInputError) throw error; return reject('plan'); }
}
function planMetadata(value: unknown): PresetChangePlan {
  const kind = 'plan';
  const input = object(value, ['presetId', 'ownerEntryId', 'optionsId', 'module', 'baseURL', 'fullRawConfigDigest', 'changes'], ['allowedGraphRoot'], kind);
  const plan: PresetChangePlan = { ...identity(input, kind), fullRawConfigDigest: digest(input.fullRawConfigDigest, kind),
    changes: changes(input.changes, kind) };
  if (Object.hasOwn(input, 'allowedGraphRoot')) {
    const root = text(input.allowedGraphRoot, 4096, kind);
    if (!isAbsolute(root)) return reject(kind);
    plan.allowedGraphRoot = root;
  }
  return bounded(plan, kind);
}

/** Accept only receipt metadata; the rollback operation separately requires an applied receipt. */
export function canonicalizePresetChangeReceipt(value: unknown): PresetChangeReceipt {
  try { return receiptMetadata(value); }
  catch (error) { if (error instanceof PresetAdapterInputError) throw error; return reject('receipt'); }
}
function receiptMetadata(value: unknown): PresetChangeReceipt {
  const kind = 'receipt';
  const optional = ['finalConfigDigest', 'rollbackBeforeConfigDigest', 'rollbackWrittenConfigDigest', 'compensationWrittenConfigDigest'] as const;
  const input = object(value, ['schemaVersion', 'status', 'presetId', 'ownerEntryId', 'optionsId', 'module', 'baseURL',
    'beforeConfigDigest', 'candidateConfigDigest', 'graphVerification', 'changes'], optional, kind);
  if (input.schemaVersion !== 'buildr.capture-preset-receipt/v1') return reject(kind);
  const status = input.status;
  if (status !== 'applied' && status !== 'rolled-back' && status !== 'compensated' && status !== 'refused') return reject(kind);
  const graphVerification = input.graphVerification;
  if (graphVerification !== 'verified' && graphVerification !== 'runner-owned') return reject(kind);
  const receipt: PresetChangeReceipt = { schemaVersion: 'buildr.capture-preset-receipt/v1', status, ...identity(input, kind),
    beforeConfigDigest: digest(input.beforeConfigDigest, kind), candidateConfigDigest: digest(input.candidateConfigDigest, kind),
    graphVerification, changes: changes(input.changes, kind) };
  for (const key of optional) if (Object.hasOwn(input, key)) receipt[key] = digest(input[key], kind);
  return bounded(receipt, kind);
}
