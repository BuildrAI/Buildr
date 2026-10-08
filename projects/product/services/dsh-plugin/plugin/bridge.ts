/** Buildr owns health and installation identity; this bridge only consumes its public status. */
import path from 'node:path';
import type { OpenResult } from './src/types.ts';
import type { BuildrChannel } from './platform.ts';

export class BuildrBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BuildrBridgeError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new BuildrBridgeError(code, message);
}

/** Keep untrusted JSON properties unknown until their consumer validates them. */
export function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** The plugin's own package identity: which installation it serves, and where Buildr runs. */
type BindingIdentity = { channel: BuildrChannel; nodeExecutable: string; cliEntry: string };
type ReadyInstance = Extract<OpenResult, { ready: true }>;
type ObservedInstance = ReadyInstance | { ready: false; channel: 'released' | 'development'; state: string };

export interface BridgeDependencies {
  query(signal: AbortSignal): Promise<unknown>;
  launch(channel: BuildrChannel, status: unknown, signal: AbortSignal): Promise<void>;
  timeoutMs?: number;
  pollMs?: number;
  wait?(ms: number, signal: AbortSignal): Promise<void>;
}

/** Accept only the canonical loopback origin emitted by Buildr's public health query. */
export function readyOrigin(value: unknown): string {
  let url: URL;
  try {
    if (typeof value !== 'string' && !(value instanceof URL)) throw new Error('not a URL');
    url = new URL(value);
  } catch { fail('invalid-status', 'Buildr 健康查询返回了无效地址。'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    fail('invalid-status', 'Buildr 健康查询未返回规范的本机地址。');
  }
  return url.origin;
}

/* Fields that identify one installation. `runtime` is deliberately excluded: it reports the
 * environment of whoever ran the query, so comparing it across callers is meaningless. */
const identityFields = ['channel', 'ownershipIdentity', 'version', 'protocolIdentity', 'applicationPayloadDigest'];
/** Public instance name for an internal channel. */
const INSTANCE_KEY: Record<BuildrChannel, string> = { npm: 'released', development: 'development' };
const WIRE_NAME: Record<BuildrChannel, 'released' | 'development'> = { npm: 'released', development: 'development' };

/**
 * Observe the channel this plugin package serves. The channel is an argument, not a stored choice, so
 * one plugin never has to decide between installations and never falls back to the other one. A
 * channel this machine does not have is reported as absent, because that is an ordinary state.
 */
export function observeBoundInstance(value: unknown, channel: BuildrChannel): ObservedInstance {
  const status = objectRecord(value);
  if (status.schemaVersion !== 'buildr.installation-status/v1') {
    fail('invalid-status', 'Buildr 安装状态格式不受支持。');
  }
  const installation = objectRecord(objectRecord(status.channels)[channel]);
  const identity = objectRecord(installation.identity);
  if (installation.status !== 'installed' && installation.status !== 'current') {
    fail('channel-missing', channel === 'development'
      ? '这台机器上没有检测到 Buildr 开发版。请先安装开发版，或改用正式版入口。'
      : '这台机器上没有检测到 Buildr。请先安装 Buildr。');
  }
  // The two installations publish different identity shapes: an npm installation identifies the
  // package it came from, while a development installation identifies the source root it runs from.
  // Requiring one shape for both is what previously rejected a perfectly installed development entry.
  const common = typeof identity.ownershipIdentity === 'string' && identity.ownershipIdentity
    && typeof identity.version === 'string' && identity.version
    && typeof identity.protocolIdentity === 'string' && identity.protocolIdentity;
  const identified = channel === 'npm'
    ? identity.package === '@buildr-ai/buildr' && identity.channel === 'npm'
    : typeof identity.sourceRoot === 'string' && path.isAbsolute(identity.sourceRoot);
  if (!common || !identified) {
    fail('installation-mismatch', channel === 'development'
      ? '当前登记的 Buildr 开发来源无法核验，请恢复源码目录或更新开发入口后重试。'
      : 'Buildr 安装信息不完整，请检查安装后重试。');
  }
  const instance = objectRecord(objectRecord(status.instances)[INSTANCE_KEY[channel]]);
  if (typeof instance.status !== 'string') fail('invalid-status', 'Buildr 缺少目标渠道的实例状态。');
  if (instance.status === 'ready') {
    const instanceIdentity = objectRecord(instance.identity);
    if (!instance.identity) fail('instance-mismatch', '正在运行的 Buildr 缺少实例身份，未打开。');
    // Buildr compares development source origins: launcher build IDs have a different meaning and
    // cannot be compared here. A healthy process remains healthy even when its source is different.
    const matches = channel === 'npm'
      ? identityFields.every(field => (instanceIdentity[field] ?? null) === (identity[field] ?? null))
      : instanceIdentity.channel === 'development' && instance.matchesCurrentInstallation === true;
    if (!matches) {
      fail('instance-mismatch', channel === 'development'
        ? '正在运行的 Buildr 开发版与当前来源不匹配或缺少来源证明；请通过 Buildr 入口正常退出旧实例，再重新启动并更新接入。'
        : '正在运行的 Buildr 不属于该安装，未打开另一份实例。');
    }
    return { ready: true, url: readyOrigin(instanceIdentity.url), channel: WIRE_NAME[channel], ownershipIdentity: identity.ownershipIdentity as string };
  }
  if (!['absent', 'stale', 'unreachable'].includes(instance.status)) {
    fail('instance-unavailable', 'Buildr 实例校验未通过，请检查安装后重试。');
  }
  return { ready: false, channel: WIRE_NAME[channel], state: instance.status };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Share concurrent clicks; every new operation re-queries the public address. Disposal never stops Buildr. */
export function createBuildrBridge(binding: BindingIdentity, { query, launch, timeoutMs = 30_000, pollMs = 300, wait = delay }: BridgeDependencies) {
  if (!['npm', 'development'].includes(binding?.channel)
      || typeof binding.nodeExecutable !== 'string' || !binding.nodeExecutable
      || typeof binding.cliEntry !== 'string' || !binding.cliEntry) {
    fail('invalid-binding', 'Buildr 接入尚未登记本机 Buildr。');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000
      || !Number.isInteger(pollMs) || pollMs < 1 || pollMs > timeoutMs) {
    fail('invalid-config', 'Buildr 启动等待时间配置无效。');
  }
  const lifetime = new AbortController();
  let pending: Promise<ReadyInstance> | undefined;
  async function run(): Promise<ReadyInstance> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new BuildrBridgeError('timeout', 'Buildr 启动等待超时，请重试。')), timeoutMs);
    const signal = AbortSignal.any([lifetime.signal, deadline.signal]);
    try {
      signal.throwIfAborted();
      let status = await query(signal);
      signal.throwIfAborted();
      let observed = observeBoundInstance(status, binding.channel);
      if (observed.ready) return observed;
      await launch(binding.channel, status, signal);
      signal.throwIfAborted();
      for (;;) {
        await wait(pollMs, signal);
        signal.throwIfAborted();
        status = await query(signal);
        signal.throwIfAborted();
        observed = observeBoundInstance(status, binding.channel);
        if (observed.ready) return observed;
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof BuildrBridgeError) throw error;
      // Do not forward command output, paths, or arbitrary status payloads to the Client.
      fail('operation-failed', 'Buildr 查询或启动失败，请检查安装后重试。');
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    open(): Promise<ReadyInstance> {
      if (lifetime.signal.aborted) return Promise.reject(lifetime.signal.reason);
      if (!pending) pending = run().finally(() => { pending = undefined; });
      return pending;
    },
    dispose() {
      lifetime.abort(new BuildrBridgeError('disposed', 'Buildr 插件已停用。'));
    },
  };
}
