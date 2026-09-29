/** Thin Host gateway; process.ts owns discovery, installation status and process lifetime. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createInstalledBuildrBridge, discoverBinding } from '../process.ts';
import type { Binding } from '../process.ts';
import { channelForPackage } from '../platform.ts';
import { BuildrBridgeError } from '../bridge.ts';
import type { Config, OpenResult } from './types.ts';
export type { Config, OpenResult } from './types.ts';

/** Shown only when this machine has no Buildr this plugin can reach. */
const MISSING_MESSAGE = '这台机器上没有检测到 Buildr。请先安装 Buildr，再重启 DSH 后重试。';

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
const CHANNEL = channelForPackage(ownPackageName());

type Bridge = NonNullable<ReturnType<typeof createInstalledBuildrBridge>>;

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
    timeoutMs: z.natural().min(1), pollMs: z.natural().min(1),
  });
  private readonly config: Config;
  private bridge: Bridge | null = null;
  private resolving: Promise<Bridge | null> | undefined;
  constructor(ctx: Context, config: Config) {
    super(ctx, 'buildr');
    this.config = config;
    // Schemastery parses an omitted optional object as `binding: {}`. It is not an override:
    // installation discovery remains the normal path for an unconfigured package.
    const binding = config.binding;
    if (binding?.nodeExecutable !== undefined || binding?.cliEntry !== undefined) {
      this.bridge = createInstalledBuildrBridge(config, CHANNEL);
    }
    // Registered unconditionally: a discovered bridge is disposed with the plugin exactly like a
    // configured one, and activation must not depend on whether a pointer happened to be present.
    ctx.effect(() => () => this.bridge?.dispose());
  }

  /** Resolve the machine pointer once, on first use, and keep serving that result. */
  private async resolve(): Promise<Bridge | null> {
    if (this.bridge !== null) return this.bridge;
    if (this.resolving !== undefined) return this.resolving;
    this.resolving = (async () => {
      const discovered: Readonly<Binding> | null = await discoverBinding();
      if (discovered === null) return null;
      const bridge = createInstalledBuildrBridge({ ...this.config, binding: { ...discovered } }, CHANNEL);
      if (bridge !== null) this.bridge = bridge;
      return bridge;
    })();
    try {
      return await this.resolving;
    } finally {
      this.resolving = undefined;
    }
  }

  /** Return only a ready address/identity or a sanitized, actionable failure. */
  @Remote('open')
  async open(): Promise<OpenResult> {
    try {
      const bridge = await this.resolve();
      if (bridge === null) return { ready: false, code: 'not-installed', message: MISSING_MESSAGE };
      return await bridge.open();
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
