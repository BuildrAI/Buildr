import type { NativeProgramPolicy } from '../program-policy.ts';

const qoderCnEntry = 'node_modules/@qodercn-ai/qoderclicn/bundle/qoderclicn.js';

export const qoderCnProgramPolicy: NativeProgramPolicy = {
  id: 'qoder-cn',
  major: 1,
  bindingSeries: '1.1',
  compatibility: '1.x.x',
  version: '1.1.86',
  package: '@qodercn-ai/qoderclicn@1.1.86',
  entry: qoderCnEntry,
  names: ['qodercn', 'qoderclicn', 'qoder-cn', 'qodercn.exe', 'qoderclicn.exe'],
  url: 'https://docs.qoder.cn/cli/installation',
  label: 'Qoder CN 配套执行程序',
  guidance: 'Buildr 会准备匹配的 Qoder CN 执行程序，无需手动安装开发工具包（SDK）或桌面应用。',
  distribution: {
    kind: 'npm',
    package: '@qodercn-ai/qoderclicn@1.1.86',
    entry: qoderCnEntry,
  },
  versionDisplay: 'package',
  supportedPlatform: (platform, arch) => ['darwin', 'linux', 'win32'].includes(platform) && ['arm64', 'x64'].includes(arch) && !(platform === 'win32' && arch === 'arm64'),
};
