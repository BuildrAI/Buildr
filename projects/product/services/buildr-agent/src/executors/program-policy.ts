/** Version admission, pinned downloads and stable persisted binding namespaces. */
export const nativeProgramPolicies = {
  codex: { major: 0, bindingSeries: '0.163', compatibility: '0.x.x', version: '0.163.0', package: '@openai/codex@0.163.0', entry: 'node_modules/@openai/codex/bin/codex.js', names: ['codex', 'codex.exe'], url: 'https://learn.chatgpt.com/docs/quickstart?setup=app', label: 'ChatGPT App（包含 Codex）' },
  dsh: { major: 0, bindingSeries: '0.2', compatibility: '0.x.x', version: '0.2.1-rc.2', package: '@deepseek-ai/dsh@0.2.1-rc.2', entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js', names: ['dsh', 'dsh.exe'], url: 'https://www.deepseek.com/en/harness/', label: 'DSH 官方程序' },
  qoder: { major: 1, bindingSeries: '1.1', compatibility: '1.x.x', version: '1.1.75', package: '@qoder-ai/qoder-agent-sdk@1.0.55', entry: `node_modules/@qoder-ai/qoder-agent-sdk/dist/_bundled/qodercli${process.platform === 'win32' ? '.exe' : ''}`, names: ['qodercli', 'qoder', 'qodercli.exe', 'qoder.exe'], url: 'https://docs.qoder.com/zh/cli/sdk/overview', label: 'Qoder 配套执行程序' },
} as const;
export function nativeProgramPolicy(provider: string) {
  if (!Object.hasOwn(nativeProgramPolicies, provider)) throw new Error('agent_program_provider_unsupported');
  return nativeProgramPolicies[provider as keyof typeof nativeProgramPolicies];
}
export function isCompatibleProgram(provider: string, version: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/.exec(version);
  if (!match || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return false;
  return match[1] === String(nativeProgramPolicy(provider).major);
}
