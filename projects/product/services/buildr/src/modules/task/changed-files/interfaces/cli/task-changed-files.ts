import path from 'node:path';
import process from 'node:process';
import type { TaskChangedFilesResult } from '../../../../../../build/generated/task-dto.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../../infrastructure/contracts/public-json.ts';

type Application = { inspectTaskChangedFiles(root: string, taskId: string): TaskChangedFilesResult };
const usage = 'buildr task changed-files <task-id> [--target <canonical-workspace>] [--json]';
function invalid(message: string) { return Object.assign(new Error(message), { code: 'task_changed_files_cli.syntax', status: 400, usage }); }

export function taskChangedFilesCommand(application: Application, args: string[]) {
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
  let result: TaskChangedFilesResult;
  try { result = application.inspectTaskChangedFiles(path.resolve(target || process.cwd()), taskId); }
  catch (error) {
    if (!json) throw error;
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.cliError, {
      error: { code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'task_changed_files_failed', message: error instanceof Error ? error.message : '变更文件查询失败。' },
      suggestions: [], help: usage,
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exitCode = 1;
    return payload;
  }
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Task ${taskId}: ${result.files.length} 个变更文件、${result.commits.length} 条关联提交（${result.status === 'complete' ? '当前范围读取完整' : '部分结果'}）\n`);
    for (const repository of result.repositories) process.stdout.write(`[${repository.label}] ${repository.branch || '-'} ${repository.fileCount} 改\n`);
    for (const file of result.files.slice(0, 40)) process.stdout.write(`  ${file.status} ${file.path}${file.additions !== null ? ` +${file.additions}/-${file.deletions ?? 0}` : ''}\n`);
    for (const diagnostic of result.diagnostics) process.stdout.write(`[${diagnostic.code}] ${diagnostic.message}\n`);
  }
  return result;
}

export function createTaskChangedFilesCliContributions(application: Application) {
  return [Object.freeze({
    key: 'task changed-files', surface: 'agent-machine', summary: '只读查询任务范围内的 Git 工作区变更文件与提交内文件列表。',
    help: [`Usage: ${usage}`, '', '按任务范围读取真实代码库的工作区状态（含未跟踪）与每条关联提交的文件改动；局部失败显式报告。不抓取远端，不写任务或 Git。'],
    match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'task' && action === 'changed-files',
    run: (_runtime: unknown, context: { argv: string[] }) => taskChangedFilesCommand(application, context.argv.slice(4)),
  })];
}
