import type { NativeProgramPolicy } from '../program-policy.ts';

const codexEntry = 'node_modules/@openai/codex/bin/codex.js';

export const codexProgramPolicy: NativeProgramPolicy = {
  id: 'codex',
  major: 0,
  bindingSeries: '0.163',
  compatibility: '0.x.x',
  version: '0.163.0',
  package: '@openai/codex@0.163.0',
  entry: codexEntry,
  names: ['codex', 'codex.exe'],
  url: 'https://developers.openai.com/codex/cli',
  label: 'Codex 独立程序',
  guidance: 'Buildr 会准备独立 Codex 程序，不依赖或修改桌面应用。',
  distribution: {
    kind: 'npm',
    package: '@openai/codex@0.163.0',
    entry: codexEntry,
  },
  versionDisplay: 'program',
};
