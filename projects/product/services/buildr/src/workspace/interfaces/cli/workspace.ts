import path from 'node:path';
import process from 'node:process';
import type { WorkspaceInitializationInput, WorkspaceInitializationResult } from '../../application/workspace-operations.ts';
import { parseCliArguments } from './cli-arguments.ts';

export type WorkspaceCliApplication = {
  initializeWorkspace(input: WorkspaceInitializationInput, onAssetsReady?: (result: WorkspaceInitializationResult) => void): WorkspaceInitializationResult;
  readBootstrapGuide(): string;
  recoverWorkspaceMutation(input: { id: string; targetRoot: string }): { id: string; alreadyRecovered: boolean };
};
export type WorkspaceCliOperation = 'init' | 'bootstrap-guide' | 'mutation-recover';

function printResult(created: string[], changed: string[]) {
  console.log('Workspace assets initialized');
  if (created.length) {
    console.log('Created:');
    for (const file of created) console.log(`  ${file}`);
  }
  if (changed.length) {
    console.log('Updated:');
    for (const file of changed) console.log(`  ${file}`);
  }
}

export function workspaceCommand(application: WorkspaceCliApplication, operation: WorkspaceCliOperation, args: string[] = []) {
  if (operation === 'bootstrap-guide') return process.stdout.write(application.readBootstrapGuide());
  const parsed = parseCliArguments(args, new Set(['--target', '--name', '--description', '--profile', '--agent']));
  const targetRoot = path.resolve(parsed.one('--target') || process.cwd());
  if (operation === 'mutation-recover') {
    const id = parsed.positions[0];
    if (!id) throw new Error('Missing mutation transaction id.');
    const result = application.recoverWorkspaceMutation({ id, targetRoot });
    console.log(result.alreadyRecovered ? `Buildr source mutation 已经恢复：${id}` : `已恢复 Buildr source mutation：${id}`);
    return result;
  }
  const input = {
    targetRoot, name: parsed.one('--name') ?? path.basename(targetRoot),
    description: parsed.one('--description') ?? 'TODO: 请补充 Workspace 的管理范围和用途。',
    profile: parsed.one('--profile') ?? 'team', agent: parsed.one('--agent'),
  };
  const result = application.initializeWorkspace(input, (ready) => {
    console.log(`Initialized Buildr root organization context at ${targetRoot}`);
    console.log(`Name: ${ready.name}`);
    console.log(`Description: ${ready.description}`);
    console.log(`Profile: ${ready.profile}`);
    printResult(ready.created, ready.changed);
    if (ready.agent !== null) {
      console.log('');
      console.log(`正在准备 ${ready.agent} runtime；该步骤复用 buildr sync ${ready.agent} 并执行最终 doctor。`);
    }
  });
  const { agent } = result;
  if (agent !== null) {
    console.log(`Buildr onboarding 已完成：${agent}（包含 sync 与最终 doctor）。`);
    console.log('下一步：请由当前 Agent 完成一次首次使用交接。');
    console.log('用普通语言说明 Workspace → Project → Service：Project 是业务、产品、系统或长期工作；Service 只在需要代码仓、应用、模块或可执行资产时接入。');
    console.log('先根据真实 Project/Service 状态确认唯一范围或只询问必要歧义，然后邀请用户直接描述第一项真实工作；不要把 project create 命令作为面向用户的默认下一步。');
    return result;
  }
  console.log('');
  console.log('仅初始化源资产的后续步骤：');
  console.log('  buildr runtime list --json');
  console.log(`  buildr sync <agent> --target ${targetRoot}`);
  console.log(`  buildr project create <project> --target ${targetRoot}`);
  console.log('');
  console.log('Agent runtime:');
  console.log('  先用 runtime list 确认当前 Agent 是否受支持；不支持时停止当前 Buildr 操作，请联系 Buildr 作者反馈该 Agent。');
  console.log(`  当前命令未写入 Agent runtime；受支持时，用 buildr sync <agent> --target ${targetRoot} 完成 runtime 与最终 doctor。`);
  console.log('  完整 Agent onboarding guidance：buildr bootstrap guide');
  return result;
}
