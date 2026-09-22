import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../../../infrastructure/process.ts';
import { assetError, relativeAssetPath } from '../domain/asset-relationships.ts';
import { assertCatalogFile } from '../persistence/asset-catalog-repository.ts';

export function observeCatalogDirectory(root: string, relative: string) {
  if (relative !== '.') { relativeAssetPath(relative, '目录'); assertCatalogFile(root, relative); }
  const location = path.resolve(root, relative);
  const stat = fs.lstatSync(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw assetError('asset_directory_invalid', '请选择真实目录。');
  const git = (args: string[]) => {
    const result = spawnSync('git', args, { cwd: location, encoding: 'utf8', timeout: 2000 });
    return result.status === 0 ? result.stdout.trim() : '';
  };
  const top = git(['rev-parse', '--show-toplevel']);
  const repositoryRoot = top ? fs.realpathSync(top) : '';
  const url = repositoryRoot ? git(['remote', 'get-url', 'origin']) : '';
  const observation = `sha256-${crypto.createHash('sha256').update(JSON.stringify({ actual: fs.realpathSync(location), dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, repositoryRoot, url })).digest('hex')}`;
  return { path: relative, observation, repositoryRoot, url };
}

/** Only known resource containers; never recurse into arbitrary repository contents. */
export function catalogDirectoryPaths(root: string, kind: 'service' | 'repository') {
  const result: string[] = kind === 'repository' ? ['.'] : [];
  const diagnostics: { code: string; path: string; message: string }[] = [];
  let visited = 0;
  const children = (relative: string) => {
    assertCatalogFile(root, relative);
    const directory = path.join(root, relative);
    if (!fs.existsSync(directory)) return [];
    const names: string[] = [];
    const handle = fs.opendirSync(directory);
    try { let entry; while ((entry = handle.readSync())) {
      if (++visited > 500) { diagnostics.push({ code: 'directory_candidates_limited', path: relative, message: '目录较多，本次只展示已核对的候选。' }); break; }
      if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name)) names.push(`${relative}/${entry.name}`);
    } } finally { handle.closeSync(); }
    return names;
  };
  if (kind === 'repository') result.push(...children('repositories'));
  for (const project of children('projects')) {
    if (kind === 'repository') result.push(project);
    result.push(...children(`${project}/services`));
    if (visited > 500) break;
  }
  return { paths: result, diagnostics };
}
