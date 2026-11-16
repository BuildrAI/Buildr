type DevCliContext = { rawArgs: string[] };

/** The static catalog and the runtime registry are separate; dispatch reads the
 * runtime registry, so the dev command must also be installed as a module. */
export function createDevelopmentCliModule(): any {
  return {
    id: 'development-cli',
    requires: Object.freeze([]),
    create() {
      return { contributions: { cli: createDevCliContributions() } };
    },
  };
}

export function createDevCliContributions(): readonly any[] {
  return [
    {
      key: 'dev live',
      surface: 'primary',
      summary: '同时运行四个服务的开发热更新模式：前端 Vite HMR，后端按改动单独重启。',
      help: [
        '用法：buildr dev [--target <workspace>] [--port <port>] [--web-port <port>] [--harness-web-port <port>] [--no-open]',
        '',
        '仅在 Buildr 产品开发 checkout 中可用。开发模式沿用 development profile 的数据根，不生成交付证明。',
        '前端改动通过 Vite 热更新；buildr 改动只重启开发宿主；buildr-harness 改动只重建并切换其运行单元。',
        '停止或接管只针对普通 development 实例，不扫描、不停止预览实例。',
      ],
      match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'dev' && (action === undefined || action.startsWith('--')),
      run: async (_runtime: any, context: DevCliContext) => {
        const { runDevelopmentLive } = await import('../../../tools/development/dev-live.ts');
        // Use the undivided tail: the generic parser would treat the value after
        // --target as a runtime identity because it does not start with "--".
        return runDevelopmentLive(context.rawArgs.slice(1));
      },
    },
  ];
}
