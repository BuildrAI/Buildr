import type { NativeProgramPolicy } from '../program-policy.ts';

const qoderEntry = `node_modules/@qoder-ai/qoder-agent-sdk/dist/_bundled/qodercli${process.platform === 'win32' ? '.exe' : ''}`;

export const qoderProgramPolicy: NativeProgramPolicy = {
  id: 'qoder',
  major: 1,
  bindingSeries: '1.1',
  compatibility: '1.x.x',
  version: '1.1.75',
  package: '@qoder-ai/qoder-agent-sdk@1.0.55',
  entry: qoderEntry,
  names: ['qodercli', 'qoder', 'qodercli.exe', 'qoder.exe'],
  url: 'https://docs.qoder.com/zh/cli/sdk/overview',
  label: 'Qoder 配套执行程序',
  guidance: 'Buildr 会准备匹配的 Qoder 执行程序，无需手动安装开发工具包（SDK）或桌面应用。',
  distribution: {
    kind: 'npm',
    package: '@qoder-ai/qoder-agent-sdk@1.0.55',
    entry: qoderEntry,
    installEnv: { QODER_INSTALL_BUNDLED_CLI: '1' },
    allowIndependentBinaryVersion: true,
  },
  versionDisplay: 'package',
  supportedPlatform: (platform, arch) => ['darwin', 'linux', 'win32'].includes(platform) && ['arm64', 'x64'].includes(arch) && !(platform === 'win32' && arch === 'arm64'),
};
