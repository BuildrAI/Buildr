/** Task-owned Host adapter. Registry services stay in the official shared runtime. */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { Context } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@deepseek-ai/dsh-config-editor';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';

export const PRESET_PRODUCERS = [
  '@deepseek-ai/dsh-agent-instructions', '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-bash',
] as const;
type Raw = Record<string, unknown>;
export interface PresetSourceRow {
  name: string; path: number[]; rawRowDigest: string;
}
export interface PresetOwnerSnapshot {
  presetId: string; ownerEntryId: string; optionsId: string; module: string; baseURL: string;
  fullRawConfigDigest: string; maskedOtherKeysDigest: string; selected: PresetSourceRow[];
}
export interface PresetSnapshot {
  schemaVersion: 'buildr.capture-preset-snapshot/v1'; owners: PresetOwnerSnapshot[];
  refused: Array<{ ownerEntryId: string; code: string }>;
}
export interface PresetNameChange {
  path: number[]; beforeName: string; beforeRowDigest: string; afterURL: string; afterFileSha256: string;
}
export interface PresetChangePlan {
  presetId: string; ownerEntryId: string; optionsId: string; module: string; baseURL: string;
  fullRawConfigDigest: string; changes: PresetNameChange[]; allowedGraphRoot?: string;
}
export interface PresetChangeReceipt {
  schemaVersion: 'buildr.capture-preset-receipt/v1'; status: 'applied' | 'rolled-back' | 'compensated' | 'refused';
  presetId: string; ownerEntryId: string; optionsId: string; module: string; baseURL: string;
  beforeConfigDigest: string; candidateConfigDigest: string; finalConfigDigest?: string;
  rollbackBeforeConfigDigest?: string; rollbackWrittenConfigDigest?: string; compensationWrittenConfigDigest?: string;
  graphVerification: 'verified' | 'runner-owned'; changes: PresetNameChange[];
}
export class PresetAdapterError extends Error {
  readonly code: string;
  readonly receipt?: PresetChangeReceipt;
  constructor(code: string, receipt?: PresetChangeReceipt) {
    super(`Preset adapter: ${code}`); this.name = 'PresetAdapterError'; this.code = code;
    if (receipt !== undefined) this.receipt = receipt;
  }
}
function fail(code: string): never { throw new PresetAdapterError(code); }
const record = (value: unknown): value is Raw => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const digestPattern = /^[a-f0-9]{64}$/;
const credentialKey = /(?:apikey|credential|secret|password|authorization|cookie|privatekey|accesskey|clientsecret|bearer|token$)/i;

/** Type-tagged, sorted-key digest; never stringify configuration into diagnostics. */
export function rawConfigDigest(value: unknown): string {
  const active = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return 'null';
    if (item === undefined) return 'undefined';
    if (typeof item === 'string') return `string:${JSON.stringify(item)}`;
    if (typeof item === 'boolean') return `boolean:${item}`;
    if (typeof item === 'number' && Number.isFinite(item)) return `number:${Object.is(item, -0) ? '-0' : item}`;
    if (!Array.isArray(item) && !record(item)) return fail('unsupported-raw-value');
    if (active.has(item)) return fail('cyclic-raw-value');
    if (Object.getOwnPropertySymbols(item).length) return fail('unsupported-raw-value');
    active.add(item);
    const output = Array.isArray(item) ? `array:[${Array.from(item, encode).join(',')}]`
      : `object:{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    active.delete(item); return output;
  }
  return createHash('sha256').update(encode(value)).digest('hex');
}
function guardRaw(value: unknown): void {
  rawConfigDigest(value);
  function visit(item: unknown): void {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (!record(item)) return;
    for (const [key, child] of Object.entries(item)) {
      if (credentialKey.test(key.replace(/[^a-z0-9]/gi, ''))) fail('credential-key');
      visit(child);
    }
  }
  visit(value);
}
function config(entry: Entry): Raw {
  const value: unknown = entry.options.config;
  if (!record(value) || typeof value.id !== 'string' || !value.id || !Array.isArray(value.plugins)) fail('invalid-preset-config');
  guardRaw(value); return value;
}
function rows(value: Raw): Array<{ path: number[]; row: Raw }> {
  const found: Array<{ path: number[]; row: Raw }> = [];
  function walk(list: unknown, parent: number[]): void {
    if (!Array.isArray(list)) fail('invalid-plugin-list');
    list.forEach((item, index) => {
      if (!record(item) || typeof item.name !== 'string' || !item.name) fail('invalid-plugin-row');
      const path = [...parent, index];
      if (item.group === true) walk(item.config, path);
      else found.push({ path, row: item });
    });
  }
  walk(value.plugins, []); return found;
}
function at(value: Raw, path: readonly number[]): Raw {
  if (!path.length || path.some(index => !Number.isSafeInteger(index) || index < 0)) fail('invalid-row-path');
  let list: unknown = value.plugins;
  let item: unknown;
  for (const [depth, index] of path.entries()) {
    if (!Array.isArray(list) || index >= list.length || !record(list[index])) fail('row-path-missing');
    item = list[index];
    if (depth < path.length - 1) {
      if (!record(item) || item.group !== true) fail('row-path-not-group');
      list = item.config;
    }
  }
  if (!record(item) || item.group === true) fail('row-path-not-producer');
  return item;
}
function selected(value: Raw): Array<{ path: number[]; row: Raw }> {
  const all = rows(value), wanted = PRESET_PRODUCERS.map(name => {
    const matches = all.filter(item => item.row.name === name);
    if (matches.length !== 1) fail(matches.length ? 'duplicate-producer' : 'missing-or-aliased-producer');
    return matches[0]!;
  });
  return wanted;
}
function masked(value: Raw, paths: readonly number[][]): Raw {
  const copy = structuredClone(value);
  for (const path of paths) at(copy, path).name = '__buildr_selected_producer_name__';
  return copy;
}
function baseURL(entry: Entry): string {
  if (typeof entry.ctx.baseUrl !== 'string' || !entry.ctx.baseUrl) return fail('missing-owner-base-url');
  return entry.ctx.baseUrl;
}
export function snapshotPresetOwners(ctx: Context): PresetSnapshot {
  const output: PresetSnapshot = { schemaVersion: 'buildr.capture-preset-snapshot/v1', owners: [], refused: [] };
  for (const entry of ctx.configEditor.entries()) {
    if (entry.options.name !== '@deepseek-ai/dsh-agent-preset') continue;
    try {
      if (entry.fiber?.state !== 2) fail('owner-inactive');
      const raw = config(entry), picked = selected(raw);
      if (ctx.configEditor.entries().filter(item => item.id === entry.id || item.options.id === entry.options.id).length !== 1) fail('ambiguous-owner');
      output.owners.push({ presetId: raw.id as string, ownerEntryId: entry.id, optionsId: entry.options.id,
        module: entry.options.name, baseURL: baseURL(entry), fullRawConfigDigest: rawConfigDigest(raw),
        maskedOtherKeysDigest: rawConfigDigest(masked(raw, picked.map(item => item.path))),
        selected: picked.map(item => ({ name: item.row.name as string, path: item.path,
          rawRowDigest: rawConfigDigest(item.row) })) });
    } catch (error) {
      output.refused.push({ ownerEntryId: entry.id, code: error instanceof PresetAdapterError ? error.code : 'snapshot-unavailable' });
    }
  }
  return output;
}
function owner(ctx: Context, plan: Pick<PresetChangePlan, 'ownerEntryId' | 'optionsId' | 'module' | 'baseURL' | 'presetId'>): Entry {
  const matches = ctx.configEditor.entries().filter(entry => entry.id === plan.ownerEntryId);
  if (matches.length !== 1) fail('owner-unavailable');
  const entry = matches[0]!;
  if (entry.options.id !== plan.optionsId || entry.options.name !== plan.module || baseURL(entry) !== plan.baseURL
    || config(entry).id !== plan.presetId) fail('owner-identity-conflict');
  return entry;
}
function validateChanges(changes: readonly PresetNameChange[]): void {
  if (changes.length !== PRESET_PRODUCERS.length) fail('invalid-change-count');
  const names = new Set<string>(), paths = new Set<string>(), urls = new Set<string>();
  for (const change of changes) {
    if (!(PRESET_PRODUCERS as readonly string[]).includes(change.beforeName) || names.has(change.beforeName)) fail('invalid-change-producer');
    names.add(change.beforeName);
    if (!Array.isArray(change.path) || !change.path.length || change.path.some(index => !Number.isSafeInteger(index) || index < 0)) fail('invalid-row-path');
    const key = JSON.stringify(change.path); if (paths.has(key)) fail('duplicate-change-path'); paths.add(key);
    if (!digestPattern.test(change.beforeRowDigest) || !digestPattern.test(change.afterFileSha256)) fail('invalid-digest');
    let url: URL; try { url = new URL(change.afterURL); } catch { return fail('invalid-producer-url'); }
    if (url.protocol !== 'file:' || url.host || url.search || url.hash || url.href !== change.afterURL) fail('invalid-producer-url');
    try { if (fileURLToPath(url).includes('\0')) fail('invalid-producer-url'); } catch { fail('invalid-producer-url'); }
    if (urls.has(url.href)) fail('duplicate-producer-url'); urls.add(url.href);
  }
}
async function verifyGraph(plan: PresetChangePlan): Promise<'verified' | 'runner-owned'> {
  if (plan.allowedGraphRoot === undefined) return 'runner-owned';
  if (!isAbsolute(plan.allowedGraphRoot)) fail('invalid-graph-root');
  let root: string; try { root = await realpath(plan.allowedGraphRoot); } catch { return fail('graph-unavailable'); }
  for (const change of plan.changes) {
    let target: string;
    try { target = await realpath(fileURLToPath(change.afterURL)); } catch { return fail('graph-unavailable'); }
    const child = relative(root, target);
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) fail('graph-ownership-conflict');
    let bytes: Buffer; try { bytes = await readFile(target); } catch { return fail('graph-unavailable'); }
    if (createHash('sha256').update(bytes).digest('hex') !== change.afterFileSha256) fail('graph-hash-conflict');
  }
  return 'verified';
}
function receipt(plan: PresetChangePlan, candidate: string, graphVerification: PresetChangeReceipt['graphVerification']): PresetChangeReceipt {
  return { schemaVersion: 'buildr.capture-preset-receipt/v1', status: 'applied', presetId: plan.presetId,
    ownerEntryId: plan.ownerEntryId, optionsId: plan.optionsId, module: plan.module, baseURL: plan.baseURL,
    beforeConfigDigest: plan.fullRawConfigDigest, candidateConfigDigest: candidate,
    graphVerification, changes: structuredClone(plan.changes) };
}
async function currentGeneration(ctx: Context, presetId: string, changes: readonly PresetNameChange[], after: boolean): Promise<void> {
  const resolved = await ctx.agentPresets.resolve(presetId);
  if (resolved.id !== presetId || resolved.broken !== undefined) fail('preset-broken');
  const current = (await ctx.agentPresets.compositionInventory()).filter(row => row.id === presetId);
  if (current.length !== 1 || current[0]!.broken !== undefined) fail('preset-inventory-unavailable');
  for (const change of changes) {
    const name = after ? change.afterURL : change.beforeName;
    const matching = current[0]!.rows.filter(row => row.moduleName === name);
    if (matching.length !== 1) fail('preset-producer-unavailable');
    // An intentionally disabled row keeps its original condition; only eligible rows must be ACTIVE.
    if (matching[0]!.enabled === 'conditional' || (matching[0]!.enabled && matching[0]!.fiberState !== 2)) fail('preset-producer-inactive');
  }
}
function finalDigest(ctx: Context, identity: Pick<PresetChangePlan, 'ownerEntryId' | 'optionsId' | 'module' | 'baseURL' | 'presetId'>,
  changes: readonly PresetNameChange[], after: boolean): string {
  const latest = config(owner(ctx, identity));
  for (const change of changes) {
    if (at(latest, change.path).name !== (after ? change.afterURL : change.beforeName)) fail('final-target-conflict');
  }
  return rawConfigDigest(latest);
}
export async function applyPresetChanges(ctx: Context, plan: PresetChangePlan): Promise<PresetChangeReceipt> {
  plan = structuredClone(plan);
  validateChanges(plan.changes);
  if (!digestPattern.test(plan.fullRawConfigDigest)) fail('invalid-digest');
  const graphVerification = await verifyGraph(plan), entry = owner(ctx, plan);
  let candidateDigest = '';
  await ctx.configEditor.edit(entry, current => {
    if (owner(ctx, plan) !== entry) fail('owner-identity-conflict');
    guardRaw(current);
    if (current.id !== plan.presetId || rawConfigDigest(current) !== plan.fullRawConfigDigest) fail('stale-preset-config');
    selected(current);
    const next = structuredClone(current);
    for (const change of plan.changes) {
      const previous = at(current, change.path);
      if (previous.name !== change.beforeName || rawConfigDigest(previous) !== change.beforeRowDigest) fail('stale-producer-row');
      at(next, change.path).name = change.afterURL;
    }
    if (!isDeepStrictEqual(masked(current, plan.changes.map(change => change.path)), masked(next, plan.changes.map(change => change.path)))) fail('non-name-change');
    candidateDigest = rawConfigDigest(next); return next;
  });
  const result = receipt(plan, candidateDigest, graphVerification);
  try {
    if (rawConfigDigest(config(owner(ctx, plan))) !== candidateDigest) fail('post-edit-config-conflict');
    await currentGeneration(ctx, plan.presetId, plan.changes, true);
    return { ...result, finalConfigDigest: finalDigest(ctx, plan, plan.changes, true) };
  } catch {
    let compensationWrittenDigest: string | undefined;
    let restoredDigest = '';
    try {
      await ctx.configEditor.edit(owner(ctx, plan), current => {
        guardRaw(current);
        if (rawConfigDigest(current) !== candidateDigest) fail('compensation-conflict');
        const next = structuredClone(current);
        for (const change of plan.changes) {
          if (at(current, change.path).name !== change.afterURL) fail('compensation-conflict');
          at(next, change.path).name = change.beforeName;
        }
        if (rawConfigDigest(next) !== plan.fullRawConfigDigest) fail('compensation-conflict');
        compensationWrittenDigest = rawConfigDigest(next);
        return next;
      });
      if (compensationWrittenDigest === undefined) fail('compensation-unobserved');
      await currentGeneration(ctx, plan.presetId, plan.changes, false);
      restoredDigest = finalDigest(ctx, plan, plan.changes, false);
    } catch {
      const refused: PresetChangeReceipt = { ...result, status: 'refused',
        ...(compensationWrittenDigest === undefined ? {} : { compensationWrittenConfigDigest: compensationWrittenDigest }) };
      // A compensation write does not prove the latest configuration or a usable generation.
      try { refused.finalConfigDigest = rawConfigDigest(config(owner(ctx, plan))); } catch { /* Owner unavailable: no final-state claim. */ }
      throw new PresetAdapterError('postcondition-failed-compensation-refused', refused);
    }
    throw new PresetAdapterError('postcondition-failed-compensated', { ...result, status: 'compensated',
      compensationWrittenConfigDigest: compensationWrittenDigest, finalConfigDigest: restoredDigest });
  }
}
export async function rollbackPresetChanges(ctx: Context, saved: PresetChangeReceipt): Promise<PresetChangeReceipt> {
  saved = structuredClone(saved);
  if (saved.schemaVersion !== 'buildr.capture-preset-receipt/v1' || saved.status !== 'applied') fail('invalid-receipt');
  validateChanges(saved.changes);
  const entry = owner(ctx, saved); let beforeRollbackDigest = '', writtenDigest = '';
  await ctx.configEditor.edit(entry, current => {
    if (owner(ctx, saved) !== entry) fail('owner-identity-conflict');
    guardRaw(current);
    if (current.id !== saved.presetId) fail('owner-identity-conflict');
    beforeRollbackDigest = rawConfigDigest(current);
    const next = structuredClone(current);
    for (const change of saved.changes) {
      if (at(current, change.path).name !== change.afterURL) fail('rollback-target-conflict');
      at(next, change.path).name = change.beforeName;
    }
    if (!isDeepStrictEqual(masked(current, saved.changes.map(change => change.path)), masked(next, saved.changes.map(change => change.path)))) fail('non-name-change');
    writtenDigest = rawConfigDigest(next); return next;
  });
  const result: PresetChangeReceipt = { ...saved, status: 'rolled-back',
    rollbackBeforeConfigDigest: beforeRollbackDigest, rollbackWrittenConfigDigest: writtenDigest };
  delete result.finalConfigDigest;
  try {
    await currentGeneration(ctx, saved.presetId, saved.changes, false);
    result.finalConfigDigest = finalDigest(ctx, saved, saved.changes, false);
  }
  catch {
    let compensationWrittenDigest: string | undefined;
    let compensatedFinalDigest = '';
    try {
      const compensationEntry = owner(ctx, saved);
      await ctx.configEditor.edit(compensationEntry, current => {
        if (owner(ctx, saved) !== compensationEntry) fail('owner-identity-conflict');
        guardRaw(current);
        if (rawConfigDigest(current) !== writtenDigest) fail('compensation-conflict');
        const next = structuredClone(current);
        for (const change of saved.changes) {
          if (at(current, change.path).name !== change.beforeName) fail('compensation-conflict');
          at(next, change.path).name = change.afterURL;
        }
        if (rawConfigDigest(next) !== beforeRollbackDigest) fail('compensation-conflict');
        compensationWrittenDigest = rawConfigDigest(next); return next;
      });
      if (compensationWrittenDigest === undefined) fail('compensation-unobserved');
      await currentGeneration(ctx, saved.presetId, saved.changes, true);
      compensatedFinalDigest = finalDigest(ctx, saved, saved.changes, true);
    } catch {
      const refused: PresetChangeReceipt = { ...result, status: 'refused',
        ...(compensationWrittenDigest === undefined ? {} : { compensationWrittenConfigDigest: compensationWrittenDigest }) };
      // A write-time hash is not a claim about the latest configuration after a failed verification.
      try { refused.finalConfigDigest = rawConfigDigest(config(owner(ctx, saved))); } catch { /* Owner unavailable: no final-state claim. */ }
      throw new PresetAdapterError('rollback-postcondition-failed-compensation-refused', refused);
    }
    throw new PresetAdapterError('rollback-postcondition-failed-compensated', { ...result, status: 'compensated',
      compensationWrittenConfigDigest: compensationWrittenDigest, finalConfigDigest: compensatedFinalDigest });
  }
  return result;
}
