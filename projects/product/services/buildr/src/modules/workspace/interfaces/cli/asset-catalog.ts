import fs from 'node:fs';
import path from 'node:path';
import { parseCliArguments } from './cli-arguments.ts';

export const ASSET_CATALOG_HELP = Object.freeze([
  'Usage: buildr assets <inspect|project-candidates|service-candidates|repository-candidates|migrate|normalize|remove|create|register|update|associate> [kind] [id] --target <workspace> [--input <json-file>] --json',
  '',
  '读取：inspect 返回当前清单、revision 和 migrationRequired；*-candidates 返回可登记目录及 observation。',
  '写入：先 inspect，再把最新 revision 与明确字段写入 --input 的 JSON 文件。版本冲突时重新读取并核对，不盲目重试。',
  'migrationRequired 为 true 时先 migrate；成功写入后使用返回的新 revision。所有路径及标识都须来自实际目标。',
  '',
  '动作与输入（以下所有写入均包含 revision；? 表示可选）：',
  '  create project        code, name, description?, serviceIds?, newServices?',
  '  register project      code, name, observation, description?, serviceIds?；observation 来自 project-candidates。',
  '  create repository     code, name?, description?, path?, url?, remote?, integrationBranch?, observation?',
  '  create service        service, projectId?；service 结构见下。',
  '  associate <project>   serviceIds, newServices?；提交完整服务 UUID 集合，空数组解除全部关联；project 可为 UUID 或 code。',
  '  update project <id>   name?, description?',
  '  update service <id>   name?, description?, type?, repositoryId?, modulePath?, repository?',
  '  update repository <id> name?, description?, url?, remote?, integrationBranch?, path?',
  '  migrate               codeMappings?；以旧 project/service 为键、新全局 code 为值解决重名。',
  '  normalize             仅 revision；按真实 Git 根归并旧 workspace 来源并重算模块位置。',
  '  remove <kind> <id>    仅 revision；kind 为 project、service、repository；id 可为 UUID 或 code。',
  '',
  'service / newServices[]：code、name 必填；description、type 可选。代码库选择和目录方式：',
  '  已有代码库：repositoryId（UUID），可选 modulePath；空 modulePath 表示整个代码库。',
  '  新代码库：repository 对象，字段与 create repository 相同但不含 revision；与 repositoryId 互斥。',
  '  已有服务目录：directoryMode="existing"、directoryPath、directoryObservation；从 service-candidates 选取。',
  '  新建服务目录：directoryMode="create"、projectCode；projectId 或项目内嵌 newServices 已提供父项目时可省略 projectCode。',
  '  目录方式自动识别代码库并计算 modulePath；不用手写 modulePath。',
  '',
  '代码库：path 是真实 Git 根，默认 repositories/<code>；工作空间自身仓库用 .，外部根用绝对路径。',
  '  已有目录可用 repository-candidates 的 path/observation；name 默认 code，remote 默认 origin。',
  '  新代码必须有 url 和 integrationBranch；已有本地仓库可不声明远端，不能猜测来源或集成分支。',
  '  update repository 省略字段保留原值，空 url 撤销远端声明；声明保存不改 Git 远端、分支或文件。',
  '移除只取消登记和关系，保留代码、文件与历史；被服务引用的代码库不能移除。登记不执行克隆。',
  '',
  '最小示例：替换 <revision> / <repository-id> / <service-id> 后保存为 input.json，每次写入后重新读取版本。',
  '  buildr assets create project --target <workspace> --input input.json --json',
  '  {"revision":"<revision>","code":"demo","name":"示例项目","description":"项目目标"}',
  '  buildr assets create service --target <workspace> --input input.json --json',
  '  {"revision":"<revision>","service":{"code":"api","name":"示例服务","repositoryId":"<repository-id>"}}',
  '  buildr assets associate demo --target <workspace> --input input.json --json',
  '  {"revision":"<revision>","serviceIds":["<service-id>"]}',
]);

export function assetCatalogCommand(application: any, args: string[]) {
  const parsed = parseCliArguments(args, new Set(['--target', '--input', '--json']), new Set(['--json']));
  const [action, kind, id] = parsed.positions;
  const root = path.resolve(parsed.one('--target') || process.cwd());
  const file = parsed.one('--input');
  const input = file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : null;
  let result;
  if (action === 'inspect') result = application.assetCatalog(root);
  else if (action === 'service-candidates' || action === 'repository-candidates') result = application.listCatalogDirectoryCandidates(root, action === 'service-candidates' ? 'service' : 'repository');
  else if (action === 'project-candidates') result = application.listProjectRegistrationCandidates(root);
  else {
    if (!input) throw new Error('写入需要 --input <json-file>，包含当前 revision 和明确字段。');
    if (action === 'migrate') result = application.migrateAssetCatalog(root, input);
    else if (action === 'normalize') result = application.normalizeCatalogRepositories(root, input);
    else if (action === 'register' && kind === 'project') result = application.registerCatalogProject(root, input);
    else if (['remove', 'delete'].includes(action) && kind && id) result = application.deleteCatalogAsset(root, kind, id, input);
    else if (action === 'associate' && kind) result = application.updateProjectServices(root, kind, input);
    else if (action === 'update' && kind && id) result = application.updateCatalogAsset(root, kind, id, input);
    else if (action === 'create' && ['project', 'service', 'repository'].includes(kind)) result = application[{ project: 'createCatalogProject', service: 'createCatalogService', repository: 'createCatalogRepository' }[kind]!](root, input);
    else throw new Error('Usage: buildr assets <inspect|project-candidates|service-candidates|repository-candidates|migrate|normalize|remove|create|register|update|associate> [kind] [id] --target <workspace> --input <json-file> --json');
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}
