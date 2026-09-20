import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from '../../../infrastructure/process.ts';
import { assetError } from '../domain/asset-relationships.ts';
import { createProjectSource, isProjectCode, type ProjectSource } from '../domain/project.ts';
import { assertCatalogFile } from '../persistence/asset-catalog-repository.ts';

export type ProjectDirectoryCandidate = { code: string; path: string; observation: string; source: ProjectSource };

/** Observe identity and local Git declarations only; never repair or materialize the directory. */
export function inspectProjectCandidateDirectory(root: string, code: string): ProjectDirectoryCandidate {
  if (!isProjectCode(code)) throw assetError('project_directory_invalid', '请选择有效的项目目录。');
  const relative = `projects/${code}`;
  assertCatalogFile(root, relative);
  const location = path.join(root, relative);
  let stat: fs.Stats;
  try { stat = fs.lstatSync(location); }
  catch { throw assetError('project_directory_changed', '项目目录已移走或不可读，请重新核对。', 409); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw assetError('project_directory_invalid', '项目位置必须是真实目录，不能使用文件或目录链接。', 409);
  const actual = fs.realpathSync(location);
  const git = (args: string[]) => {
    const result = spawnSync('git', args, { cwd: actual, encoding: 'utf8', timeout: 2000 });
    return result.status === 0 ? result.stdout.trim() : '';
  };
  let hasGit = false;
  try { fs.lstatSync(path.join(actual, '.git')); hasGit = true; }
  catch (error: any) { if (error.code !== 'ENOENT') throw assetError('project_source_invalid', '项目的 Git 来源不可读，请先修复后重新核对。', 409); }
  const topLevel = hasGit ? git(['rev-parse', '--show-toplevel']) : '';
  let source: ProjectSource = { type: 'workspace', path: relative };
  if (topLevel && fs.realpathSync(topLevel) === actual) {
    const url = git(['remote', 'get-url', 'origin']);
    const remoteHead = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    const integrationBranch = remoteHead.startsWith('origin/') ? remoteHead.slice(7) : git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (!url || !integrationBranch) throw assetError('project_source_incomplete', '独立 Git 项目缺少 origin 地址或可确认的分支，请先补全后重新核对。', 409);
    source = createProjectSource({ type: 'git', path: relative, git: { url, remote: 'origin', integrationBranch } }, code);
  } else if (hasGit) {
    throw assetError('project_source_invalid', '项目的 Git 来源不可读，请先修复后重新核对。', 409);
  }
  const observation = `sha256-${crypto.createHash('sha256').update(JSON.stringify({ actual, dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, source })).digest('hex')}`;
  return { code, path: relative, observation, source };
}
