/** Passive, bounded subprocess access to Buildr-owned source observations. */
import { execFile } from 'node:child_process';
import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { BuildrBridgeError, objectRecord } from './bridge.ts';
import { channelCommand, childEnvironment, fileDigest, queryInstallation, validateBinding } from './process.ts';
import type { Binding, BuildrChannel, ProcessDependencies } from './process.ts';
import type {
  SourceDigest, SourceDiagnostic, SourceObject, SourceObservation, SourceObservations,
  SourceQueryItem, SourceQueryResult,
} from './src/source-types.ts';

/** Limits match the public v1 input; output is separately bounded at the subprocess boundary. */
const INPUT_LIMIT = 2 * 1024 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const TEXT_LIMIT = 512 * 1024;
const ITEM_LIMIT = 32;
const DIGEST = /^sha256-[a-f0-9]{64}$/;
const OBSERVATION_TYPES = ['file', 'skill', 'task-brief', 'task-material', 'capability'] as const;
const OBJECT_TYPES = ['rule', 'skill', 'task-brief', 'task-material', 'capability'] as const;

export interface SourceProcessDependencies extends ProcessDependencies {
  /** Replaces only the input-bearing source command, not the installation query. */
  runInput?(file: string, args: string[], options: ExecFileOptionsWithStringEncoding, input: string): Promise<{ stdout: string; stderr?: string }>;
  timeoutMs?: number;
  /** May narrow, never widen, the public bounds. */
  maxInputBytes?: number;
  maxOutputBytes?: number;
}

/** Request-local approved command paths; no identity or digest is cached across producer calls. */
export interface SourceCommandInstallation {
  prefixes: string[][];
  nodeExecutables?: readonly string[];
  /** Verify one explicit spelling against the approved physical file and its unchanged digest. */
  verifyFile?(actual: string, expected: string): Promise<boolean>;
}

function fail(code: string, message: string): never { throw new BuildrBridgeError(code, message); }
function invalidInput(): never { return fail('source-invalid-input', 'Buildr 来源查询参数无效或超出范围。'); }
function invalidResult(): never { return fail('source-invalid-response', 'Buildr 来源查询返回了不受支持的数据。'); }
function record(value: unknown, invalid = invalidResult): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, invalid = invalidResult): string {
  if (typeof value !== 'string' || !value || value.includes('\0') || Buffer.byteLength(value) > 4096) invalid();
  return value as string;
}
function content(value: unknown, invalid = invalidResult): string {
  if (typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value) > TEXT_LIMIT) invalid();
  return value as string;
}
function digest(value: unknown, invalid = invalidResult): SourceDigest {
  if (typeof value !== 'string' || !DIGEST.test(value)) invalid();
  return value as SourceDigest;
}
function choice<T extends string>(value: unknown, choices: readonly T[], invalid = invalidResult): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) invalid();
  return value as T;
}
function fields(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalidInput();
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalidResult();
  return value as unknown[];
}
function optionalObserved(value: Record<string, unknown>): SourceObject['observed'] {
  return {
    ...(value.content === undefined ? {} : { content: content(value.content) }),
    ...(value.digest === undefined ? {} : { digest: digest(value.digest) }),
  };
}
function limit(value: number | undefined, ceiling: number): number {
  const actual = value ?? ceiling;
  if (!Number.isSafeInteger(actual) || actual < 1 || actual > ceiling) invalidInput();
  return actual;
}

/** Validate untrusted wire inputs; no arbitrary properties are sent to the bound CLI. */
export function parseSourceObservations(value: unknown, maxBytes = INPUT_LIMIT): SourceObservations {
  const input = record(value, invalidInput);
  fields(input, ['schemaVersion', 'scope', 'observations', 'mode']);
  if (input.schemaVersion !== 'buildr.agent-asset-source-observations/v1'
      || !Array.isArray(input.observations) || input.observations.length > ITEM_LIMIT) invalidInput();
  const ids = new Set<string>();
  const observations: SourceObservation[] = input.observations.map(raw => {
    const item = record(raw, invalidInput);
    fields(item, ['id', 'type', 'locator', 'observedContent', 'observedDigest', 'taskId', 'materialId', 'capabilityId', 'version']);
    const id = text(item.id, invalidInput);
    if (ids.has(id)) invalidInput();
    ids.add(id);
    const result: SourceObservation = { id, type: choice(item.type, OBSERVATION_TYPES, invalidInput) };
    if (item.locator !== undefined) {
      const locator = record(item.locator, invalidInput);
      fields(locator, ['path', 'resourceBase', 'provider', 'adapterId']);
      result.locator = {};
      for (const key of ['path', 'resourceBase', 'provider', 'adapterId'] as const) {
        if (locator[key] !== undefined) result.locator[key] = text(locator[key], invalidInput);
      }
    }
    if (item.observedContent !== undefined) result.observedContent = content(item.observedContent, invalidInput);
    if (item.observedDigest !== undefined) result.observedDigest = digest(item.observedDigest, invalidInput);
    for (const key of ['taskId', 'materialId', 'capabilityId'] as const) {
      if (item[key] !== undefined) result[key] = text(item[key], invalidInput);
    }
    if (item.version !== undefined) {
      if (!Number.isSafeInteger(item.version) || Number(item.version) < 1) invalidInput();
      result.version = Number(item.version);
    }
    return result;
  });
  const result: SourceObservations = {
    schemaVersion: 'buildr.agent-asset-source-observations/v1',
    ...(input.mode === undefined ? {} : { mode: choice(input.mode, ['metadata', 'content'] as const, invalidInput) }),
    ...(input.scope === undefined ? {} : { scope: text(input.scope, invalidInput) }),
    observations,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > limit(maxBytes, INPUT_LIMIT)) invalidInput();
  return result;
}

function parseObject(value: unknown): SourceObject {
  const item = record(value);
  const selector: SourceObject['selector'] = Object.create(null) as SourceObject['selector'];
  const selectorInput = record(item.selector);
  if (Object.keys(selectorInput).length > 32) invalidResult();
  for (const [key, val] of Object.entries(selectorInput)) {
    text(key);
    if (typeof val === 'number' && Number.isFinite(val)) selector[key] = val;
    else selector[key] = text(val);
  }
  const current = item.current === null ? null : record(item.current);
  const observed = record(item.observed);
  const output: SourceObject = {
    identity: text(item.identity), kind: choice(item.kind, OBJECT_TYPES), scope: text(item.scope),
    workspaceId: text(item.workspaceId),
    providedBy: choice(item.providedBy, ['buildr', 'workspace', 'openspec', 'external', 'unknown']),
    managedBy: item.managedBy === null ? null : choice(item.managedBy, ['buildr'] as const),
    selector,
    current: current === null ? null : { content: content(current.content), digest: digest(current.digest) },
    observed: optionalObserved(observed),
    historical: choice(item.historical, ['matched-current', 'different', 'unknown']),
    evidence: list(item.evidence, 64).map(raw => {
      const evidence = record(raw);
      return { authority: text(evidence.authority), locator: text(evidence.locator),
        ...(evidence.digest === undefined ? {} : { digest: digest(evidence.digest) }) };
    }),
  };
  if (item.selection !== undefined) {
    const selection = record(item.selection);
    if (selection.unit !== 'utf16' || !Number.isSafeInteger(selection.startOffset)
        || !Number.isSafeInteger(selection.endOffset) || Number(selection.startOffset) < 0
        || Number(selection.endOffset) < Number(selection.startOffset)) invalidResult();
    output.selection = { startOffset: Number(selection.startOffset), endOffset: Number(selection.endOffset), unit: 'utf16' };
  }
  return output;
}

/** Diagnostic messages are plugin-owned; raw CLI error text never enters the Client. */
function diagnostic(value: unknown): SourceDiagnostic | null {
  if (value === null) return null;
  const item = record(value);
  const code = text(item.code);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(code)) invalidResult();
  text(item.message);
  return { code, message: 'Buildr 来源对象不可取得或证据不足；未改变原始记录。' };
}

/** Validate output, bind item ids to the request, and discard unowned extension fields. */
export function parseSourceQueryResult(value: unknown, input: SourceObservations): SourceQueryResult {
  const result = record(value);
  if (result.schemaVersion !== 'buildr.agent-asset-source-result/v1') {
    fail('source-unavailable', '当前 Buildr 安装未提供所需的只读来源契约。');
  }
  if (!Array.isArray(result.effects) || result.effects.length !== 0) {
    fail('source-read-only-violation', 'Buildr 来源响应不符合只读契约，已拒绝显示。');
  }
  const workspace = record(result.workspace);
  const ids = new Set(input.observations.map(item => item.id));
  const seen = new Set<string>();
  const items: SourceQueryItem[] = list(result.items, ITEM_LIMIT).map(raw => {
    const item = record(raw);
    const id = text(item.id);
    if (!ids.has(id) || seen.has(id)) invalidResult();
    seen.add(id);
    if (item.mixed !== undefined && typeof item.mixed !== 'boolean') invalidResult();
    return {
      id, status: choice(item.status, ['detected', 'unknown', 'conflict', 'error']),
      objects: list(item.objects, 64).map(parseObject), diagnostic: diagnostic(item.diagnostic),
      ...(item.mixed === undefined ? {} : { mixed: item.mixed as boolean }),
    };
  });
  if (seen.size !== ids.size) invalidResult();
  return {
    schemaVersion: 'buildr.agent-asset-source-result/v1',
    workspace: { id: text(workspace.id), scope: text(workspace.scope) }, items, effects: [],
  };
}

function runInput(file: string, args: string[], options: ExecFileOptionsWithStringEncoding, input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
    if (child.stdin === null) {
      child.kill();
      reject(new Error('stdin unavailable'));
      return;
    }
    child.stdin.on('error', reject);
    child.stdin.end(input, 'utf8');
  });
}

function installation(value: unknown, channel: BuildrChannel): void {
  const status = objectRecord(value);
  if (status.schemaVersion !== 'buildr.installation-status/v1') {
    fail('source-unavailable', 'Buildr 安装状态不支持被动来源读取。');
  }
  const found = objectRecord(objectRecord(status.channels)[channel]);
  if (!['installed', 'current'].includes(String(found.status))) {
    fail('source-channel-missing', '未检测到当前插件所绑定渠道的 Buildr 安装。');
  }
  const identity = objectRecord(found.identity);
  if (typeof identity.ownershipIdentity !== 'string' || !identity.ownershipIdentity
      || typeof identity.version !== 'string' || !identity.version
      || typeof identity.protocolIdentity !== 'string' || !identity.protocolIdentity
      || (channel === 'npm' && (identity.package !== '@buildr-ai/buildr' || identity.channel !== 'npm'))
      || (channel === 'development' && (typeof identity.sourceRoot !== 'string' || !path.isAbsolute(identity.sourceRoot)))) {
    fail('source-installation-mismatch', '当前 Buildr 安装身份不完整，未读取其他安装。');
  }
}

/** File identity and mutation stamps are reread before every request-local digest reuse. */
async function fileStamp(file: string): Promise<string> {
  const info = await stat(file, { bigint: true });
  if (!info.isFile()) fail('installation-drift', 'Buildr 安装入口缺失或已变化，未执行来源查询。');
  return [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(':');
}

/** No digest or installation status survives this one source query. */
function requestDigests(readDigest: (file: string) => Promise<string>): (file: string) => Promise<string> {
  const verified = new Map<string, { stamp: string; digest: string }>();
  return async file => {
    const before = await fileStamp(file);
    const cached = verified.get(file);
    if (cached?.stamp === before) return cached.digest;
    const digest = await readDigest(file);
    if (await fileStamp(file) !== before) {
      fail('installation-drift', 'Buildr 安装入口缺失或已变化，未执行来源查询。');
    }
    verified.set(file, { stamp: before, digest });
    return digest;
  };
}

/** Current bound entry proof for a recorded command; this never runs the recorded operation. */
export async function inspectSourceInstallation(
  binding: Readonly<Binding>, channel: BuildrChannel, signal: AbortSignal, dependencies: SourceProcessDependencies = {},
): Promise<SourceCommandInstallation> {
  const bound = validateBinding(binding), digestFile = requestDigests(dependencies.digest ?? fileDigest);
  signal.throwIfAborted();
  const [nodeDigest, cliDigest] = await Promise.all([digestFile(bound.nodeExecutable), digestFile(bound.cliEntry)]);
  if ((bound.nodeSha256 && bound.nodeSha256 !== nodeDigest) || (bound.cliSha256 && bound.cliSha256 !== cliDigest))
    fail('installation-drift', 'Buildr 安装入口缺失或已变化，未确认原命令来源。');
  const status = await queryInstallation(bound, signal, { ...dependencies, digest: digestFile });
  installation(status, channel);
  const command = channelCommand(bound, channel, status);
  if (await digestFile(bound.nodeExecutable) !== nodeDigest || await digestFile(bound.cliEntry) !== cliDigest)
    fail('installation-drift', 'Buildr 安装入口在核对期间变化，未确认原命令来源。');
  const [commandDigest, commandNodeDigest] = await Promise.all([digestFile(command.executable), digestFile(command.nodeExecutable)]);
  signal.throwIfAborted();
  const prefixes = [[command.executable, ...command.argv], ...(channel === 'npm' ? [[bound.cliEntry]] : [])];
  if (channel === 'development') {
    const sourceRoot = objectRecord(objectRecord(objectRecord(status).channels).development);
    const root = String(objectRecord(sourceRoot.identity).sourceRoot);
    const expectedEntry = path.join(path.resolve(root), 'bin/buildr.mjs');
    if (path.resolve(bound.cliEntry) === expectedEntry) {
      try {
        const [physicalRoot, physicalEntry] = await Promise.all([realpath(root), realpath(expectedEntry)]);
        // The bound entry must live at the public source identity's own bin, even through filesystem aliases.
        if (physicalEntry === path.join(physicalRoot, 'bin/buildr.mjs')) {
          if (await digestFile(bound.nodeExecutable) !== nodeDigest || await digestFile(bound.cliEntry) !== cliDigest)
            fail('installation-drift', 'Buildr 安装入口在核对期间变化，未确认原命令来源。');
          prefixes.push([bound.nodeExecutable, bound.cliEntry]);
        }
      } catch (error) {
        if (error instanceof BuildrBridgeError) throw error;
        // Missing physical identity cannot establish the additional entry; the proven wrapper remains usable.
      }
    }
  }
  const nodeExecutables = [...new Set([bound.nodeExecutable, command.nodeExecutable])];
  const files = new Map<string, { physical: string; digest: string; stamp: string }>();
  for (const file of new Set([...prefixes.flat(), ...nodeExecutables])) {
    signal.throwIfAborted();
    const before = await fileStamp(file), physical = await realpath(file), digest = await digestFile(file);
    if (await fileStamp(file) !== before || await realpath(file) !== physical) fail('installation-drift', 'Buildr 批准入口在核对期间变化，未确认原命令来源。');
    files.set(file, { physical, digest, stamp: before });
  }
  if (await digestFile(bound.nodeExecutable) !== nodeDigest || await digestFile(bound.cliEntry) !== cliDigest
    || files.get(command.executable)?.digest !== commandDigest || files.get(command.nodeExecutable)?.digest !== commandNodeDigest) {
    fail('installation-drift', 'Buildr 批准入口在身份核对期间变化，未确认原命令来源。');
  }
  const verifyFile = async (actual: string, expected: string): Promise<boolean> => {
    signal.throwIfAborted();
    const identity = files.get(expected);
    if (identity === undefined) return false;
    if (await realpath(expected) !== identity.physical || await fileStamp(expected) !== identity.stamp
      || await digestFile(expected) !== identity.digest) fail('installation-drift', 'Buildr 批准入口在核对之后变化，未确认原命令来源。');
    try {
      if (await realpath(actual) !== identity.physical || await fileStamp(actual) !== identity.stamp) return false;
      signal.throwIfAborted();
      return await realpath(actual) === identity.physical && await fileStamp(actual) === identity.stamp;
    } catch (error) { signal.throwIfAborted(); return false; }
  };
  signal.throwIfAborted();
  return { prefixes, nodeExecutables, verifyFile };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new BuildrBridgeError('source-cancelled', 'Buildr 来源查询已取消。'));
    // Attach settlement handlers even when the producer aborted synchronously.
    promise.then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); },
    );
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Read source objects from one bound installation without a launcher or Web instance.
 * The Host, not the Client, chooses targetRoot from the actual Session header.
 */
export async function queryAssetSources(
  binding: Readonly<Binding>, channel: BuildrChannel, targetRoot: string,
  input: SourceObservations, callerSignal: AbortSignal, dependencies: SourceProcessDependencies = {},
): Promise<SourceQueryResult> {
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) invalidInput();
  if (!['npm', 'development'].includes(channel) || typeof targetRoot !== 'string'
      || !path.isAbsolute(targetRoot) || targetRoot.includes('\0')) invalidInput();
  const observations = parseSourceObservations(input, limit(dependencies.maxInputBytes, INPUT_LIMIT));
  const maxOutput = limit(dependencies.maxOutputBytes, OUTPUT_LIMIT);
  const bound = validateBinding(binding);
  const digestFile = requestDigests(dependencies.digest ?? fileDigest);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = AbortSignal.any([callerSignal, deadline.signal]);
  try {
    signal.throwIfAborted();
    const target = path.resolve(targetRoot);
    const info = await abortable(stat(target), signal);
    if (!info.isDirectory()) invalidInput();
    const [nodeDigest, entryDigest] = await abortable(Promise.all([
      digestFile(bound.nodeExecutable), digestFile(bound.cliEntry),
    ]), signal);
    if ((bound.nodeSha256 && bound.nodeSha256 !== nodeDigest) || (bound.cliSha256 && bound.cliSha256 !== entryDigest)) {
      fail('installation-drift', 'Buildr 安装入口缺失或已变化，未执行来源查询。');
    }
    const status = await abortable(queryInstallation(bound, signal, { ...dependencies, digest: digestFile }), signal);
    installation(status, channel);
    const command = channelCommand(bound, channel, status);
    // Recheck the exact bound files after status resolves, before starting the second read.
    if (await abortable(digestFile(bound.nodeExecutable), signal) !== nodeDigest
        || await abortable(digestFile(bound.cliEntry), signal) !== entryDigest) {
      fail('installation-drift', 'Buildr 安装入口缺失或已变化，未执行来源查询。');
    }
    if (channel === 'development') {
      await abortable(digestFile(command.executable), signal);
      await abortable(digestFile(command.nodeExecutable), signal);
    }
    const result = await abortable((dependencies.runInput ?? runInput)(command.executable, [
      ...command.argv, 'agent-assets', 'source', 'inspect', '--target', target, '--input', '-', '--json',
    ], {
      cwd: target,
      env: childEnvironment(dependencies.environment ?? process.env, { ...bound, nodeExecutable: command.nodeExecutable }, channel),
      shell: false, windowsHide: true, signal, timeout: timeoutMs, maxBuffer: maxOutput, encoding: 'utf8',
    }, JSON.stringify(observations)), signal);
    if (Buffer.byteLength(result.stdout) > maxOutput) fail('source-output-limit', 'Buildr 来源响应超过读取限制。');
    let parsed: unknown;
    try { parsed = JSON.parse(result.stdout) as unknown; }
    catch { invalidResult(); }
    return parseSourceQueryResult(parsed, observations);
  } catch (error) {
    if (callerSignal.aborted) fail('source-cancelled', 'Buildr 来源查询已取消。');
    if (deadline.signal.aborted) fail('source-timeout', 'Buildr 来源查询超时，原始记录仍可查看。');
    if (error instanceof BuildrBridgeError) throw error;
    const code = objectRecord(error).code;
    if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') fail('source-output-limit', 'Buildr 来源响应超过读取限制。');
    fail('source-unavailable', 'Buildr 来源读取不可用；未启动服务或读取其他安装。');
  } finally { clearTimeout(timer); }
}
