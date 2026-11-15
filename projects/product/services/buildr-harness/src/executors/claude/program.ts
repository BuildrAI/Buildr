import type { NativeProgramPolicy } from '../program-policy.ts';

const claudePlatform = `${process.platform}-${process.arch}${process.platform === 'linux' && !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } })?.header?.glibcVersionRuntime ? '-musl' : ''}`;
const claudePackage = `@anthropic-ai/claude-code-${claudePlatform}`;
const claudeEntry = `node_modules/${claudePackage}/claude${process.platform === 'win32' ? '.exe' : ''}`;

export const claudeProgramPolicy: NativeProgramPolicy = {
  id: 'claude-code',
  major: 2,
  minVersion: [2, 1, 322],
  bindingSeries: '2.1',
  compatibility: '>=2.1.322 <3',
  version: '2.1.322',
  package: `${claudePackage}@2.1.322`,
  entry: claudeEntry,
  names: ['claude', 'claude.exe'],
  url: 'https://code.claude.com/docs/en/setup',
  label: 'Claude 独立执行程序',
  guidance: 'Buildr 会准备独立 Claude Code 执行程序，由官方 Agent SDK 驱动。可选择已有模型或 Claude API Key，不提供 claude.ai 订阅登录。第三方模型走 Buildr 兼容路径，具体能力以实测为准。',
  distribution: {
    kind: 'npm',
    package: `${claudePackage}@2.1.322`,
    entry: claudeEntry,
  },
  versionDisplay: 'program',
};
