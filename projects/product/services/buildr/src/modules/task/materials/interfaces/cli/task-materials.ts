import path from 'node:path';
import process from 'node:process';
import type { TaskMaterialsManifest } from '../../../../../../build/generated/task-dto.ts';
import type { TaskMaterialsApplication } from '../../application/task-materials-application.ts';
import { MAX_TASK_DOCUMENT_BYTES, readBoundedText } from '../../application/task-project-document-reader.ts';

type Operation = 'inspect' | 'record' | 'write';
export function taskMaterialsCommand(application: TaskMaterialsApplication, operation: Operation, args: string[]) {
  const allowed = new Set(['--target', '--json', ...(operation === 'record' ? ['--materials', '--expected-current'] : operation === 'write' ? ['--path', '--content', '--expected-document'] : [])]);
  const values = new Map<string, string | boolean>();
  let taskId: string | undefined;
  const invalid = (message: string) => Object.assign(new Error(message), { code: 'task_materials_cli.syntax', status: 400 });
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('-')) { if (taskId) throw invalid('必须且只能指定一个任务编码。'); taskId = value; continue; }
    if (!allowed.has(value) || values.has(value)) throw invalid(`不支持或重复参数：${value}`);
    if (value === '--json') values.set(value, true);
    else { const argument = args[++index]; if (!argument || argument.startsWith('--')) throw invalid(`缺少参数值：${value}`); values.set(value, argument); }
  }
  if (!taskId) throw invalid('必须指定任务编码。');
  const one = (name: string): string => { const value = values.get(name); if (typeof value !== 'string') throw invalid(`缺少参数：${name}`); return value; };
  const inputText = (name: string, limit: number) => {
    const file = path.resolve(one(name));
    const observed = readBoundedText(path.dirname(file), path.basename(file), limit);
    if (!observed.exists) throw invalid(`输入文件不存在：${name}`);
    return observed.content!;
  };
  const root = path.resolve(typeof values.get('--target') === 'string' ? String(values.get('--target')) : process.cwd());
  let result;
  if (operation === 'inspect') result = application.inspectTaskMaterials(root, taskId);
  else if (operation === 'record') {
    let materials: TaskMaterialsManifest;
    try { materials = JSON.parse(inputText('--materials', 128 * 1024)); } catch { throw invalid('--materials 必须是有界合法 UTF-8 JSON 清单。'); }
    if (!materials || materials.schemaVersion !== 'buildr.task-materials/v2' || Object.keys(materials).sort().join(',') !== 'documents,schemaVersion') throw invalid('--materials 只接受 buildr.task-materials/v2 的 {schemaVersion,documents} 完整清单；任务说明请写入 Task Record.brief。');
    result = application.recordTaskMaterials(root, taskId, { expectedCurrent: one('--expected-current'), documents: materials.documents });
  } else result = application.writeTaskMaterialDocument(root, taskId, { path: one('--path'), content: inputText('--content', MAX_TASK_DOCUMENT_BYTES), expectedDocumentDigest: one('--expected-document') });
  process.stdout.write(values.get('--json') ? `${JSON.stringify(result, null, 2)}\n` : `Task ${taskId} materials ${operation}: ${'materialsDigest' in result ? result.materialsDigest : result.actualDigest}\n`);
  return result;
}
export function createTaskMaterialsCliContributions(application: TaskMaterialsApplication) {
  return (['inspect', 'record', 'write'] as const).map(operation => Object.freeze({
    key: `task materials ${operation}`, surface: 'agent-machine', summary: operation === 'inspect' ? '零写入读取独立任务材料、当前正文与来源。' : '按已观察材料版本安全保存引用或任务本机正文。',
    help: [`Usage: buildr task materials ${operation} <task-id> ${operation === 'record' ? '--materials <json-file> --expected-current <absent|sha256-digest> ' : operation === 'write' ? '--path <relative-md> --content <utf8-file> --expected-document <absent|sha256-digest> ' : ''}[--target <canonical-workspace>] [--json]`, '清单与正文分别观察版本；冲突后重新读取判断，不自动覆盖；不修改任务或专业记录。'],
    match: ({ domain, action, runtimeId }: { domain?: string; action?: string; runtimeId?: string }) => domain === 'task' && action === 'materials' && runtimeId === operation,
    run: (_runtime: unknown, context: { argv: string[] }) => taskMaterialsCommand(application, operation, context.argv.slice(5)),
  }));
}
