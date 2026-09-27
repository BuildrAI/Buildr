import path from 'node:path';
import process from 'node:process';
import type { TaskCommitsResult } from '../../../../../../build/generated/task-dto.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../../infrastructure/contracts/public-json.ts';

type Application = { inspectTaskCommits(root: string, taskId: string): TaskCommitsResult };
const usage = 'buildr task commits <task-id> [--target <canonical-workspace>] [--json]';
function invalid(message: string) { return Object.assign(new Error(message), { code: 'task_commits_cli.syntax', status: 400, usage }); }

export function taskCommitsCommand(application: Application, args: string[]) {
  let taskId: string | undefined;
  let target: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') { if (json) throw invalid('--json 不能重复。'); json = true; }
    else if (value === '--target') {
      if (target !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw invalid('--target 必须且只能提供一个工作空间。');
      target = args[++index];
    } else if (value.startsWith('-') || taskId) throw invalid(`不支持参数：${value}`);
    else taskId = value;
  }
  if (!taskId) throw invalid('必须指定一个任务编码。');
  let result: TaskCommitsResult;
  try { result = application.inspectTaskCommits(path.resolve(target || process.cwd()), taskId); }
  catch (error) {
    if (!json) throw error;
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.cliError, {
      error: { code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'task_commits_failed', message: error instanceof Error ? error.message : '提交查询失败。' },
      suggestions: [], help: usage,
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exitCode = 1;
    return payload;
  }
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Task ${taskId}: ${result.commits.length} 条已确认关联提交（${result.status === 'complete' ? '当前范围读取完整' : '部分结果'}）\n`);
    for (const commit of result.commits) process.stdout.write(`${commit.hash} ${commit.subject}\n`);
    for (const diagnostic of result.diagnostics) process.stdout.write(`[${diagnostic.code}] ${diagnostic.message}\n`);
  }
  return result;
}

export function createTaskCommitsCliContributions(application: Application) {
  return [Object.freeze({
    key: 'task commits', surface: 'agent-machine', summary: '只读查询任务范围中含 Buildr-Task 尾注的当前可达 Git 提交。',
    help: [`Usage: ${usage}`, '', '读取实际 Git 对象、完整提交说明与哈希值；部分失败或扫描截断会显式报告。不抓取远端，不写任务或 Git。'],
    match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'task' && action === 'commits',
    run: (_runtime: unknown, context: { argv: string[] }) => taskCommitsCommand(application, context.argv.slice(4)),
  })];
}
