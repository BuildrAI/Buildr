import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolveProductRoot} from '../../infrastructure/product-resources/index.ts';

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
        '用法：buildr dev [--target <workspace>] [--port <port>] [--no-open]',
        '',
        '仅在 Buildr 产品开发 checkout 中可用。开发模式沿用 development profile 的数据根，不生成交付证明。',
        '4458 同源提供两个前端、API 和 HMR；后端先准备检查再受控更新，失败尝试恢复上一可运行代码。',
        '契约自动生成；开发更新与正式安装互斥，自举激活期间暂停。停止只针对认证的自有实例，不扫描预览。',
      ],
      match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'dev' && (action === undefined || action.startsWith('--')),
      run: async (_runtime: any, context: DevCliContext) => {
        const entry = path.join(resolveProductRoot(), 'tools/development/dev-live.ts');
        if (!fs.existsSync(entry)) throw new Error('buildr dev requires the Buildr product source checkout; installed packages only provide static hosting.');
        // Do not statically trace the source-only supervisor (or Vite tooling)
        // into the formal CJS application payload.
        const { runDevelopmentLive } = await import(pathToFileURL(entry).href);
        // Use the undivided tail: the generic parser would treat the value after
        // --target as a runtime identity because it does not start with "--".
        return runDevelopmentLive(context.rawArgs.slice(1));
      },
    },
  ];
}
