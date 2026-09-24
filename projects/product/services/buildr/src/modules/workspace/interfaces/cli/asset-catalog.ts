import fs from 'node:fs';
import path from 'node:path';
import { parseCliArguments } from './cli-arguments.ts';

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
