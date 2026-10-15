import path from 'node:path';
import process from 'node:process';
import type { TaskBriefMigrationApplication } from '../../application/task-brief-migration.ts';

export function createTaskBriefMigrationCliContribution(application: TaskBriefMigrationApplication) {
  return Object.freeze({
    key: 'task brief migrate', surface: 'agent-machine', summary: '显式导入旧独立任务说明到记录 brief，保留原文件和其他材料。',
    help: ['Usage: buildr task brief migrate <task-id> --expected-record <digest> --expected-materials <digest> --expected-document <digest> [--dry-run] [--target <workspace>] [--json]', '       buildr task brief migrate --all [--dry-run] [--target <workspace>] [--json]', '批次逐项观察并校验版本；不在读取中迁移，不覆盖已编辑正文，不删除原文件。'],
    match: ({ domain, action, runtimeId }: { domain?: string; action?: string; runtimeId?: string }) => domain === 'task' && action === 'brief' && runtimeId === 'migrate',
    run: (_runtime: unknown, context: { argv: string[] }) => {
      const values = new Map<string, string | boolean>();
      let taskId: string | undefined;
      const fail = (message: string): never => { throw Object.assign(new Error(message), { code: 'task_brief_migration_cli.syntax', status: 400 }); };
      const args = context.argv.slice(5), switches = new Set(['--all', '--dry-run', '--json']), flags = new Set(['--target', '--expected-record', '--expected-materials', '--expected-document']);
      for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (!arg.startsWith('-')) { if (taskId) fail('只能指定一个任务编码。'); taskId = arg; continue; }
        if (values.has(arg) || (!switches.has(arg) && !flags.has(arg))) fail(`未知或重复参数：${arg}`);
        if (switches.has(arg)) values.set(arg, true);
        else { const value = args[++index]; if (!value || value.startsWith('--')) fail(`缺少参数：${arg}`); values.set(arg, value); }
      }
      const all = Boolean(values.get('--all'));
      if (all === Boolean(taskId)) fail('必须指定一个任务编码或 --all。');
      const dryRun = Boolean(values.get('--dry-run'));
      const one = (name: string) => typeof values.get(name) === 'string' ? String(values.get(name)) : undefined;
      if (all && ['--expected-record', '--expected-materials', '--expected-document'].some(name => values.has(name))) fail('批次入口不接受单任务版本参数。');
      if (!all && !dryRun && ['--expected-record', '--expected-materials', '--expected-document'].some(name => !one(name))) fail('单任务导入必须提供记录、关联和正文的已观察版本；先使用 --dry-run 读取。');
      const root = path.resolve(one('--target') || process.cwd());
      const result = all ? application.migrateTaskBriefs(root, { dryRun }) : application.migrateTaskBrief(root, taskId!, { dryRun, expectedRecordDigest: one('--expected-record'), expectedMaterialsDigest: one('--expected-materials'), expectedDocumentDigest: one('--expected-document') });
      process.stdout.write(values.get('--json') ? `${JSON.stringify(result, null, 2)}\n` : `Task brief migration: ${result.status}\n`);
      if (['partial', 'failed', 'source-unavailable'].includes(result.status)) process.exitCode = 1;
      return result;
    },
  });
}
