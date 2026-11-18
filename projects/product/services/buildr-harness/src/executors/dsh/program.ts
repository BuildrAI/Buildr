import type { NativeProgramPolicy } from '../program-policy.ts';

const dshEntry = 'node_modules/@deepseek-ai/dsh/lib/bin.js';
const dshCompanionPackages = (version: string) => [
  '@deepseek-ai/cordis@4.0.5',
  `@deepseek-ai/dsh-api-account-controller@${version}`,
  `@deepseek-ai/dsh-api-gateway@${version}`,
  `@deepseek-ai/dsh-api-job-controller@${version}`,
  `@deepseek-ai/dsh-api-session-controller@${version}`,
  `@deepseek-ai/dsh-api-settings-controller@${version}`,
  `@deepseek-ai/dsh-api-workspace-controller@${version}`,
  `@deepseek-ai/dsh-client-connection@${version}`,
  `@deepseek-ai/dsh-commands@${version}`,
  `@deepseek-ai/dsh-permission-presets@${version}`,
  `@deepseek-ai/dsh-typert-registry@${version}`,
  `@deepseek-ai/dsh-user-approval@${version}`,
  `@deepseek-ai/dsh-user-questions@${version}`,
];

export const dshProgramPolicy: NativeProgramPolicy = {
  id: 'dsh',
  major: 0,
  bindingSeries: '0.2',
  compatibility: '0.x.x',
  version: '0.2.1-rc.2',
  package: '@deepseek-ai/dsh@0.2.1-rc.2',
  entry: dshEntry,
  names: ['dsh', 'dsh.exe'],
  url: 'https://www.deepseek.com/en/harness/',
  label: 'DSH 官方程序',
  guidance: '可以准备独立 DSH 程序，无需先安装桌面应用。',
  distribution: {
    kind: 'npm',
    package: '@deepseek-ai/dsh@0.2.1-rc.2',
    entry: dshEntry,
    companionPackages: dshCompanionPackages,
  },
  versionDisplay: 'program',
};
