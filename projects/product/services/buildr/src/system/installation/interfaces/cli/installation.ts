export function createInstallationCliContributions() {
  return Object.freeze([
    {
      key: 'installation status',
      surface: 'primary',
      summary: '分别报告 npm、development、本机 Launcher 与当前运行实例的可信身份。',
      help: [
        'Usage: buildr installation status [--json]',
        '',
        '只读取 embedded identity 与 ownership receipt；不会扫描 PATH 或按文件名猜测来源。',
      ],
      match: ({ domain, action }: any) => domain === 'installation' && action === 'status',
      run: (runtime: any, context: any) => runtime.installationStatus(context.argv.slice(4)),
    },
    {
      key: 'update check',
      surface: 'primary',
      summary: '同时检查 GA 正式版与 RC 候选版；不读取 workspace。',
      help: [
        'Usage: buildr update check [--json]',
        '',
        '同时检查 latest 对应的 GA 正式版与 next 对应的 RC 候选版；不读取 workspace。',
      ],
      match: ({ domain, action }: any) => domain === 'update' && action === 'check',
      run: (runtime: any, context: any) => runtime.updateCheck(context.argv.slice(4)),
    },
    {
      key: 'update',
      surface: 'primary',
      summary: '更新 Buildr CLI 自身；npm installation 可显式选择 GA 或 RC。',
      help: [
        'Usage: buildr update [--track <stable|candidate>] [--json]',
        '',
        'npm installation 使用 --track stable 选择 GA 正式版，使用 --track candidate 选择 RC 候选版。',
        '省略 --track 时，当前 RC 跟随 candidate，当前正式版跟随 stable；不会自动切轨或降级。',
        '同步 workspace 请使用 buildr sync <agent> --target <dir>。',
      ],
      match: ({ domain }: any) => domain === 'update',
      run: (runtime: any, context: any) => runtime.updateBuildr(context.argv.slice(3)),
    },
  ].map(Object.freeze));
}
