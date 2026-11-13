import type { NativeProgramPolicy } from '../program-policy.ts';

const dshEntry = 'node_modules/@deepseek-ai/dsh/lib/bin.js';

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
  },
  versionDisplay: 'program',
};
