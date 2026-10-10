/** Thin Host gateway; process.ts owns discovery, installation status and process lifetime. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createDiscoveringBuildrBridge } from '../process.ts';
import { channelForPackage } from '../platform.ts';
import { BuildrBridgeError } from '../bridge.ts';
import type { ActivationStatus, Config, OpenResult } from './types.ts';
import { createActivation } from '../activation.ts';
import type {} from '@deepseek-ai/dsh-session-query';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { readObservedSourceEvents, sourceRecord as readSourceRecord } from '../source-gateway.ts';
import type { SourceEventReadRequest } from '../source-gateway.ts';
import { createEventSourceCapture, mergeCapturedSources } from '../source-capture.ts';
import type {} from '@deepseek-ai/dsh-tools';
import { resolveCommandIdentityBindings, resolveSourceBinding } from '../source-binding.ts';
import type { SourceRecordRequest, SourceRecordResult } from './source-types.ts';
export type { SourceRecordRequest, SourceRecordResult } from './source-types.ts';
export type { ActivationStatus, Config, OpenResult } from './types.ts';

/** Shown only when this machine has no Buildr this plugin can reach. */
const MISSING_MESSAGE = '这台机器上没有检测到 Buildr。请先安装 Buildr 后重试。';

/**
 * The package decides which installation it serves, so the user is never asked to choose. Reading the
 * plugin's own manifest keeps the released and development packages the same code with one difference.
 */
function ownPackageName(): string {
  try {
    const manifest = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')) as { name?: unknown };
    return typeof manifest.name === 'string' ? manifest.name : '';
  } catch {
    return '';
  }
}
const PACKAGE_NAME = ownPackageName();
const CHANNEL = channelForPackage(PACKAGE_NAME);

/**
 * One gateway per plugin lifetime. The machine pointer comes from configuration when present; when it
 * is absent — the normal case for a package installed from npm or a repository — the gateway
 * discovers Buildr itself, so installing the plugin is the only step a user performs.
 */
export default class BuildrGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    // An explicit override, for the rare machine where discovery cannot be used. The normal install
    // from npm or a repository carries no paths at all, and an install that cannot reach Buildr must
    // still load and explain itself.
    binding: z.object({
      nodeExecutable: z.string(), cliEntry: z.string(),
      nodeSha256: z.string(), cliSha256: z.string(),
    }).required(false),
    sourceBinding: z.object({
      nodeExecutable: z.string(), cliEntry: z.string(),
      nodeSha256: z.string(), cliSha256: z.string(),
    }).required(false),
    timeoutMs: z.natural().min(1), pollMs: z.natural().min(1),
  });
  private readonly config: Config;
  private readonly hostContext: Context;
  private readonly sourceLifetime = new AbortController();
  private bridge: ReturnType<typeof createDiscoveringBuildrBridge> | undefined;
  private readonly qualification: ReturnType<typeof createActivation>;
  private captureRegistered = false;
  constructor(ctx: Context, config: Config) {
    super(ctx, 'buildr');
    this.config = config;
    this.hostContext = ctx;
    this.qualification = createActivation(ctx, PACKAGE_NAME);
    // Registered unconditionally: a discovered bridge is disposed with the plugin exactly like a
    // configured one, and activation must not depend on whether a pointer happened to be present.
    ctx.effect(() => () => {
      this.sourceLifetime.abort();
      this.bridge?.dispose();
    });
    this.activation();
  }

  /** Recheck a released lease without changing another bundle's saved enablement. */
  @Remote('activation')
  activation(): ActivationStatus {
    const status = this.qualification.status();
    if (!status.active || this.captureRegistered) return status;
    this.bridge = createDiscoveringBuildrBridge(this.config, CHANNEL);
    this.captureRegistered = true;
    const capture = createEventSourceCapture({
      channel: CHANNEL, signal: this.sourceLifetime.signal,
      processDependencies: { timeoutMs: this.config.timeoutMs ?? 5_000 },
      resolveBinding: () => resolveSourceBinding(this.config, CHANNEL),
      resolveCommandBindings: () => resolveCommandIdentityBindings(this.config, CHANNEL),
    });
    this.hostContext.on('tools/source-capture', async (request, next) => {
      if (!this.qualification.status().active) return next();
      const source = await capture(request);
      // Another explicitly installed source provider can establish its own facts.
      try {
        const other = await next();
        return mergeCapturedSources(source, other);
      } catch { return source; }
    });
    return status;
  }

  /** Read only the selected record's original events and captured Buildr fragments. */
  @Remote('sourceRecord')
  async sourceRecord(request: SourceRecordRequest): Promise<SourceRecordResult> {
    const status = this.activation();
    if (!status.active) return { ready: false, code: status.code, message: status.message };
    const reader = this.hostContext.get('sessionQuery');
    return readSourceRecord(request, {
      signal: this.sourceLifetime.signal,
      timeoutMs: this.config.timeoutMs ?? 10_000,
      ...(reader === undefined || typeof reader.observeSession !== 'function' ? {} : {
        readEvents: (address: SourceEventReadRequest, signal: AbortSignal) => readObservedSourceEvents(address, signal,
          (sessionId, options) => reader.observeSession(sessionId as SessionId, options)),
      }),
    });
  }

  /** Return only a ready address/identity or a sanitized, actionable failure. */
  @Remote('open')
  async open(): Promise<OpenResult> {
    try {
      const status = this.activation();
      if (!status.active) return { ready: false, code: status.code, message: status.message };
      return await this.bridge!.open() ?? { ready: false, code: 'not-installed', message: MISSING_MESSAGE };
    } catch (error) {
      return error instanceof BuildrBridgeError
        ? { ready: false, code: error.code, message: error.message }
        : { ready: false, code: 'unavailable', message: 'Buildr 暂时不可用，请重试。' };
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { buildr: BuildrGateway }
}
